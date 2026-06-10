import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealtimeSurfaceTabsModel } from '../lib/components/realtime/realtime-surface-tabs.model';
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
    it('adds + focuses + flashes a new artifact tab and emits Changed$', () => {
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
      expect(model.ActiveKey).toBe('artifact:av-1');
      expect(model.FlashKey).toBe('artifact:av-1');
      expect(changed).toHaveBeenCalledTimes(1);
    });

    it('can add without focusing (focus=false) but still flashes', () => {
      model.OpenArtifactTab(weather, false);
      expect(model.ActiveKey).toBe('activity');
      expect(model.FlashKey).toBe('artifact:av-1');
    });

    it('dedupes by artifact version: re-opening focuses the existing tab without re-flashing', () => {
      model.OpenArtifactTab(weather);
      model.ClearFlash();
      model.Focus('activity');

      const tab = model.OpenArtifactTab(weather);

      expect(model.Tabs).toHaveLength(2);
      expect(tab.Key).toBe('artifact:av-1');
      expect(model.ActiveKey).toBe('artifact:av-1');
      expect(model.FlashKey).toBeNull();
    });

    it('keeps artifact tabs in arrival order before any channel tabs', () => {
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      model.OpenArtifactTab(weather);
      model.OpenArtifactTab(summary);

      expect(model.Tabs.map(t => t.Key)).toEqual(['activity', 'artifact:av-1', 'artifact:av-2', 'whiteboard']);
    });

    it('replaces the Tabs array immutably', () => {
      const before = model.Tabs;
      model.OpenArtifactTab(weather);
      expect(model.Tabs).not.toBe(before);
    });
  });

  describe('RegisterChannelTab', () => {
    it('adds a channel tab without stealing focus by default', () => {
      model.RegisterChannelTab({ Key: 'whiteboard', Title: 'Whiteboard', Icon: 'fa-solid fa-chalkboard' });
      expect(model.Tabs.map(t => t.Key)).toEqual(['activity', 'whiteboard']);
      expect(model.Tabs[1].Kind).toBe('channel');
      expect(model.Tabs[1].Data?.Content).toBeUndefined();
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
      expect(model.Tabs[1].Title).toBe('Whiteboard · live');
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
});
