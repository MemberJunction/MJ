import { describe, it, expect } from 'vitest';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import { RealtimeSurfaceStageModel } from '../lib/components/realtime/realtime-surface-stage.model';

/** A channel plugin with a name and nothing else. */
class TestChannel extends BaseRealtimeChannelClient {
  public constructor(private readonly name: string) {
    super();
  }
  public get ChannelName(): string { return this.name; }
  public get ToolNamePrefix(): string { return `${this.name}_`; }
  public get TabTitle(): string { return this.name; }
  public get TabIcon(): string { return 'fa-solid fa-cube'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] { return []; }
  public ApplyAgentTool(): string { return '{}'; }
}

describe('RealtimeSurfaceStageModel', () => {
  const placements = (model: RealtimeSurfaceStageModel) => model.Surfaces.map((s) => `${s.Key}:${s.Placement}`);

  it('creates no surface for a registered channel until it is seen', () => {
    const model = new RealtimeSurfaceStageModel();
    model.Register(new TestChannel('Whiteboard'));
    expect(model.Surfaces).toEqual([]);
  });

  it('creates a surface when its tab is shown, and keeps it when the tab is no longer shown', () => {
    const model = new RealtimeSurfaceStageModel();
    model.Register(new TestChannel('Whiteboard'));
    model.SetActiveTab('Whiteboard');
    expect(placements(model)).toEqual(['Whiteboard:tab']);
    model.SetActiveTab(null);
    expect(placements(model)).toEqual(['Whiteboard:tab']);
  });

  it('puts the focused channel on the stage, creating it if needed, and back on its tab when focus ends', () => {
    const model = new RealtimeSurfaceStageModel();
    model.Register(new TestChannel('Whiteboard'));
    model.Register(new TestChannel('Media'));
    model.SetActiveTab('Media');
    model.SetFocus('Whiteboard');
    expect(placements(model)).toEqual(['Whiteboard:stage', 'Media:tab']);
    model.SetFocus(null);
    expect(placements(model)).toEqual(['Whiteboard:tab', 'Media:tab']);
  });

  it('keeps registration order whatever order the surfaces were seen in', () => {
    const model = new RealtimeSurfaceStageModel();
    model.Register(new TestChannel('Whiteboard'));
    model.Register(new TestChannel('Media'));
    model.SetActiveTab('Media');
    model.SetActiveTab('Whiteboard');
    expect(placements(model)).toEqual(['Whiteboard:tab', 'Media:tab']);
  });

  it('shows a tab that was active before its channel registered once it registers', () => {
    const model = new RealtimeSurfaceStageModel();
    model.SetActiveTab('Whiteboard');
    expect(model.Surfaces).toEqual([]);
    model.Register(new TestChannel('Whiteboard'));
    expect(placements(model)).toEqual(['Whiteboard:tab']);
  });

  it('drops the surface of a channel that left the session, and does not bring it back unseen', () => {
    const model = new RealtimeSurfaceStageModel();
    const whiteboard = new TestChannel('Whiteboard');
    const media = new TestChannel('Media');
    model.Register(whiteboard);
    model.Register(media);
    model.SetActiveTab('Whiteboard');
    model.SetActiveTab('Media');
    model.SetActiveTab(null);
    model.KeepOnly([media]);
    expect(placements(model)).toEqual(['Media:tab']);
    expect(model.PluginFor('Whiteboard')).toBeNull();
    model.Register(whiteboard);
    expect(placements(model)).toEqual(['Media:tab']);
  });

  it('follows a channel that comes back as a new plugin instance under the same key', () => {
    const model = new RealtimeSurfaceStageModel();
    const before = new TestChannel('Whiteboard');
    const after = new TestChannel('Whiteboard');
    model.Register(before);
    model.SetActiveTab('Whiteboard');
    model.KeepOnly([after]);
    model.Register(after);
    expect(model.PluginFor('Whiteboard')).toBe(after);
    expect(placements(model)).toEqual(['Whiteboard:tab']);
  });

  it('replaces the surfaces array only when a surface or a placement changes', () => {
    const model = new RealtimeSurfaceStageModel();
    const whiteboard = new TestChannel('Whiteboard');
    model.Register(whiteboard);
    model.SetActiveTab('Whiteboard');
    const shown = model.Surfaces;
    model.SetActiveTab(null);
    model.Register(whiteboard);
    model.KeepOnly([whiteboard]);
    expect(model.Surfaces).toBe(shown);
    model.SetFocus('Whiteboard');
    expect(model.Surfaces).not.toBe(shown);
  });
});
