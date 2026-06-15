import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeSurfaceTabsModel, ShouldRemoveReviewWhiteboardTab } from '../lib/components/realtime/realtime-surface-tabs.model';
import type { ParsedDelegationArtifact } from '../lib/services/delegation-result-parser';

const weather: ParsedDelegationArtifact = { ArtifactID: 'a-1', ArtifactVersionID: 'av-1', Name: 'Weather Report' };
const summary: ParsedDelegationArtifact = { ArtifactID: 'a-2', ArtifactVersionID: 'av-2', Name: 'Q3 Summary' };

describe('RealtimeSurfaceTabsModel', () => {
  let model: RealtimeSurfaceTabsModel;

  beforeEach(() => {
    model = new RealtimeSurfaceTabsModel();
  });

  it('starts with the Activity tab, focused', () => {
    expect(model.Tabs).toHaveLength(1);
    expect(model.Tabs[0]).toMatchObject({ Key: 'activity', Title: 'Activity', Kind: 'activity' });
    expect(model.ActiveKey).toBe('activity');
    expect(model.ActiveTab.Kind).toBe('activity');
    expect(model.FlashKey).toBeNull();
  });

  describe('OpenArtifactTab', () => {
    it('adds + flashes a new artifact tab WITHOUT stealing focus (glow, don\'t grab) and emits Changed$', () => {
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      const tab = model.OpenArtifactTab(weather);

      expect(model.Tabs).toHaveLength(2);
      expect(tab).toMatchObject({
        Key: 'artifact:av-1',
        Title: 'Weather Report',
        Icon: 'fa-solid fa-file-lines',
        Kind: 'artifact'
      });
      expect(tab.Data?.Artifact).toEqual(weather);
      expect(model.ActiveKey).toBe('activity'); // a finished artifact never steals the screen
      expect(model.FlashKey).toBe('artifact:av-1');
      expect(model.IsUnseen('artifact:av-1')).toBe(true); // persistent glow until visited
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('can add WITH focus (the user-asked path) — focused tabs are never marked unseen', () => {
      model.OpenArtifactTab(weather, true);
      expect(model.ActiveKey).toBe('artifact:av-1');
      expect(model.FlashKey).toBe('artifact:av-1');
      expect(model.IsUnseen('artifact:av-1')).toBe(false);
    });

    it('history carryover (markUnseen=false) adds without glow or focus', () => {
      model.OpenArtifactTab(weather, false, false);
      expect(model.ActiveKey).toBe('activity');
      expect(model.IsUnseen('artifact:av-1')).toBe(false);
    });

    it('visiting an unseen tab clears its glow', () => {
      model.OpenArtifactTab(weather);
      expect(model.IsUnseen('artifact:av-1')).toBe(true);
      model.Focus('artifact:av-1');
      expect(model.IsUnseen('artifact:av-1')).toBe(false);
    });

    it('dedupes by artifact version: re-opening with focus focuses the existing tab without re-flashing', () => {
      model.OpenArtifactTab(weather, true);
      model.ClearFlash();
      model.Focus('activity');

      const tab = model.OpenArtifactTab(weather, true);

      expect(model.Tabs).toHaveLength(2);
      expect(tab.Key).toBe('artifact:av-1');
      expect(model.ActiveKey).toBe('artifact:av-1');
      expect(model.FlashKey).toBeNull();
    });

    it('orders the strip channels… | artifacts (arrival order)… | Activity pinned LAST', () => {
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.OpenArtifactTab(weather);
      model.OpenArtifactTab(summary);

      expect(model.Tabs.map(t => t.Key)).toEqual(['whiteboard', 'artifact:av-1', 'artifact:av-2', 'activity']);
    });

    it('replaces the Tabs array immutably', () => {
      const before = model.Tabs;
      model.OpenArtifactTab(weather);
      expect(model.Tabs).not.toBe(before);
    });
  });

  describe('RegisterChannelTab', () => {
    it('adds a channel tab LEADING the strip (before Activity) without stealing focus by default', () => {
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      expect(model.Tabs.map(t => t.Key)).toEqual(['whiteboard', 'activity']);
      expect(model.Tabs[0].Kind).toBe('channel');
      expect(model.Tabs[0].Data?.Content).toBeUndefined();
      expect(model.ActiveKey).toBe('activity');
    });

    it('focuses when Focus is set', () => {
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      expect(model.ActiveKey).toBe('whiteboard');
    });

    it('re-registering the same key updates the tab in place (placeholder → real surface)', () => {
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard · live', Icon: 'fa-solid fa-chalkboard' });

      expect(model.Tabs).toHaveLength(2);
      expect(model.Tabs[0].Title).toBe('Whiteboard · live');
    });
  });

  describe('Focus / ClearFlash', () => {
    it('Focus switches the active tab and emits', () => {
      model.OpenArtifactTab(weather, false);
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.Focus('artifact:av-1');

      expect(model.ActiveKey).toBe('artifact:av-1');
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('Focus is a no-op for unknown keys and the already-active key', () => {
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.Focus('nope');
      model.Focus('activity');

      expect(model.ActiveKey).toBe('activity');
      expect(changed).not.toHaveBeenCalled();
    });

    it('ClearFlash clears and emits once; subsequent calls are no-ops', () => {
      model.OpenArtifactTab(weather);
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.ClearFlash();
      model.ClearFlash();

      expect(model.FlashKey).toBeNull();
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('ActiveTab falls back to the Activity tab for a stale ActiveKey', () => {
      model.ActiveKey = 'gone';
      expect(model.ActiveTab.Key).toBe('activity');
    });
  });

  describe('RemoveTab', () => {
    it('removes a channel tab and emits Changed$ once', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      expect(model.RemoveTab('Whiteboard')).toBe(true);

      expect(model.Tabs.some(t => t.Key === 'Whiteboard')).toBe(false);
      expect(model.Tabs).toHaveLength(1); // Activity remains
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('falls focus back to Activity when the removed tab was active', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      expect(model.ActiveKey).toBe('Whiteboard');

      model.RemoveTab('Whiteboard');

      expect(model.ActiveKey).toBe('activity');
      expect(model.ActiveTab.Kind).toBe('activity');
    });

    it('keeps the current focus when a NON-active tab is removed', () => {
      model.OpenArtifactTab(weather, true); // focused (user-asked path)
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });

      model.RemoveTab('Whiteboard');

      expect(model.ActiveKey).toBe('artifact:av-1');
    });

    it('cleans a pending flash on the removed tab', () => {
      model.OpenArtifactTab(weather); // flashes artifact:av-1
      expect(model.FlashKey).toBe('artifact:av-1');

      model.RemoveTab('artifact:av-1');

      expect(model.FlashKey).toBeNull();
    });

    it('the Activity tab is IRREMOVABLE (no-op, no emission)', () => {
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      expect(model.RemoveTab('activity')).toBe(false);

      expect(model.Tabs).toHaveLength(1);
      expect(changed).not.toHaveBeenCalled();
    });

    it('an unknown key is a no-op (false, no emission)', () => {
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      expect(model.RemoveTab('nope')).toBe(false);
      expect(changed).not.toHaveBeenCalled();
    });

    it('a removed channel tab can be re-registered cleanly afterward', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.RemoveTab('Whiteboard');

      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });

      expect(model.Tabs.some(t => t.Key === 'Whiteboard')).toBe(true);
      expect(model.ActiveKey).toBe('Whiteboard');
    });
  });
});

describe('ShouldRemoveReviewWhiteboardTab (review→live continuation edge)', () => {
  const whiteboard = { ChannelName: 'Whiteboard' };
  const notes = { ChannelName: 'Notes' };

  it('removes when live is active, a review board tab exists, and the live set lacks a Whiteboard channel', () => {
    expect(ShouldRemoveReviewWhiteboardTab(true, true, [notes])).toBe(true);
    expect(ShouldRemoveReviewWhiteboardTab(true, true, [])).toBe(true);
  });

  it('keeps the tab when the live channel set HAS a Whiteboard channel (it upgrades in place)', () => {
    expect(ShouldRemoveReviewWhiteboardTab(true, true, [whiteboard])).toBe(false);
    expect(ShouldRemoveReviewWhiteboardTab(true, true, [notes, { ChannelName: ' whiteboard ' }])).toBe(false);
  });

  it('never removes when no live session is active (initial / teardown [] emissions)', () => {
    expect(ShouldRemoveReviewWhiteboardTab(false, true, [])).toBe(false);
  });

  it('never removes when review mode registered no whiteboard tab', () => {
    expect(ShouldRemoveReviewWhiteboardTab(true, false, [])).toBe(false);
  });
});
