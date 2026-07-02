import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeSurfaceTabsModel, ShouldRemoveReviewWhiteboardTab } from '../lib/components/realtime/realtime-surface-tabs.model';

describe('RealtimeSurfaceTabsModel', () => {
  let model: RealtimeSurfaceTabsModel;

  beforeEach(() => {
    model = new RealtimeSurfaceTabsModel();
  });

  it('starts with NO tabs (the Activity tab is gated; channels appear as used)', () => {
    expect(model.Tabs).toHaveLength(0);
    expect(model.IsActivityShown).toBe(false);
    expect(model.FlashKey).toBeNull();
    // ActiveTab always resolves to SOMETHING renderable even on an empty strip.
    expect(model.ActiveTab.Kind).toBe('activity');
  });

  describe('SetShowActivityTab (the ≥1-agent-run gate)', () => {
    it('adds the Activity tab LAST and emits when first shown', () => {
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.SetShowActivityTab(true);

      expect(model.IsActivityShown).toBe(true);
      expect(model.Tabs.map(t => t.Key)).toEqual(['activity']);
      expect(model.Tabs[0].Icon).toBe('fa-solid fa-wave-square');
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('is a no-op (no emission) when unchanged', () => {
      model.SetShowActivityTab(true);
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.SetShowActivityTab(true);

      expect(changed).not.toHaveBeenCalled();
    });

    it('pins Activity LAST after channel tabs', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.SetShowActivityTab(true);
      expect(model.Tabs.map(t => t.Key)).toEqual(['Whiteboard', 'activity']);
    });

    it('hiding it while it was focused falls focus back to the first channel tab', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.SetShowActivityTab(true);
      model.Focus('activity');
      expect(model.ActiveKey).toBe('activity');

      model.SetShowActivityTab(false);

      expect(model.ActiveKey).toBe('Whiteboard');
    });
  });

  describe('RegisterChannelTab', () => {
    it('adds a channel tab in the left cluster, with a derived color, without stealing focus', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });

      expect(model.Tabs.map(t => t.Key)).toEqual(['Whiteboard']);
      expect(model.Tabs[0].Kind).toBe('channel');
      expect(model.Tabs[0].Color).toMatch(/^hsl\(/); // deterministic hash color
      // ActiveKey is unchanged (no Focus); ActiveTab resolves to the only tab via fallback.
      expect(model.ActiveKey).toBe('activity');
      expect(model.ActiveTab.Key).toBe('Whiteboard');
    });

    it('keeps an explicit Color when supplied', () => {
      model.RegisterChannelTab({ Key: 'Notes', Title: 'Notes', Icon: 'fa-solid fa-note', Color: 'hsl(10, 50%, 50%)' });
      expect(model.Tabs[0].Color).toBe('hsl(10, 50%, 50%)');
    });

    it('the same channel name always derives the same color (deterministic)', () => {
      const a = new RealtimeSurfaceTabsModel();
      const b = new RealtimeSurfaceTabsModel();
      a.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      b.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      expect(a.Tabs[0].Color).toBe(b.Tabs[0].Color);
    });

    it('focuses when Focus is set', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      expect(model.ActiveKey).toBe('Whiteboard');
    });

    it('re-registering the same key updates the tab in place (placeholder → real surface)', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard · live', Icon: 'fa-solid fa-chalkboard' });

      expect(model.Tabs).toHaveLength(1);
      expect(model.Tabs[0].Title).toBe('Whiteboard · live');
    });

    it('orders the strip: channels (registration order) … | Activity LAST', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.RegisterChannelTab({ Key: 'Notes', Title: 'Notes', Icon: 'fa-solid fa-note' });
      model.SetShowActivityTab(true);

      expect(model.Tabs.map(t => t.Key)).toEqual(['Whiteboard', 'Notes', 'activity']);
    });
  });

  describe('Focus / FlashTab / ClearFlash', () => {
    it('Focus switches the active tab and emits', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      model.SetShowActivityTab(true);
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.Focus('activity'); // moves off the focused Whiteboard tab

      expect(model.ActiveKey).toBe('activity');
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('Focus is a no-op for unknown keys and the already-active key', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      model.Focus('nope');
      model.Focus('Whiteboard'); // already active

      expect(model.ActiveKey).toBe('Whiteboard');
      expect(changed).not.toHaveBeenCalled();
    });

    it('FlashTab marks a known tab without changing focus; ClearFlash clears once', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.SetShowActivityTab(true);
      model.Focus('activity');

      model.FlashTab('Whiteboard');
      expect(model.FlashKey).toBe('Whiteboard');
      expect(model.ActiveKey).toBe('activity'); // flash never steals focus

      const changed = vi.fn();
      model.Changed$.subscribe(changed);
      model.ClearFlash();
      model.ClearFlash();
      expect(model.FlashKey).toBeNull();
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('FlashTab is a no-op for an unknown key', () => {
      model.FlashTab('ghost');
      expect(model.FlashKey).toBeNull();
    });

    it('ActiveTab falls back to Activity for a stale ActiveKey', () => {
      model.SetShowActivityTab(true);
      model.ActiveKey = 'gone';
      expect(model.ActiveTab.Key).toBe('activity');
    });
  });

  describe('RemoveTab', () => {
    it('removes a channel tab and emits Changed$ once', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.SetShowActivityTab(true);
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      expect(model.RemoveTab('Whiteboard')).toBe(true);

      expect(model.Tabs.some(t => t.Key === 'Whiteboard')).toBe(false);
      expect(model.Tabs.map(t => t.Key)).toEqual(['activity']);
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('falls focus back to Activity (when shown) when the removed tab was active', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      model.SetShowActivityTab(true);
      expect(model.ActiveKey).toBe('Whiteboard');

      model.RemoveTab('Whiteboard');

      expect(model.ActiveKey).toBe('activity');
    });

    it('falls focus back to the next channel tab when Activity is hidden', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      model.RegisterChannelTab({ Key: 'Notes', Title: 'Notes', Icon: 'fa-solid fa-note' });

      model.RemoveTab('Whiteboard');

      expect(model.ActiveKey).toBe('Notes');
    });

    it('keeps the current focus when a NON-active tab is removed', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard', Focus: true });
      model.RegisterChannelTab({ Key: 'Notes', Title: 'Notes', Icon: 'fa-solid fa-note' });

      model.RemoveTab('Notes');

      expect(model.ActiveKey).toBe('Whiteboard');
    });

    it('cleans a pending flash on the removed tab', () => {
      model.RegisterChannelTab({ Key: 'Whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.FlashTab('Whiteboard');
      expect(model.FlashKey).toBe('Whiteboard');

      model.RemoveTab('Whiteboard');

      expect(model.FlashKey).toBeNull();
    });

    it('the Activity tab is IRREMOVABLE (no-op, no emission)', () => {
      model.SetShowActivityTab(true);
      const changed = vi.fn();
      model.Changed$.subscribe(changed);

      expect(model.RemoveTab('activity')).toBe(false);

      expect(model.Tabs.map(t => t.Key)).toEqual(['activity']);
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
