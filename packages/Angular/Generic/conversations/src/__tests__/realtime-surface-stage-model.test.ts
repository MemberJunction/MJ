import { describe, it, expect } from 'vitest';
import type { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '@memberjunction/realtime-runtime';
import type { MediaStagePlacement } from '@memberjunction/ng-realtime-media';
import { RealtimeSurfaceStageModel } from '../lib/components/realtime/realtime-surface-stage.model';

const ANYWHERE: readonly MediaStagePlacement[] = ['stage', 'pip', 'tab', 'hidden'];

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
  const surfaces = (model: RealtimeSurfaceStageModel) => model.Surfaces.map((s) => `${s.Key}:${s.Placement}`);
  const placements = (model: RealtimeSurfaceStageModel) => Object.fromEntries(model.Placements);

  /** A model with the given channels registered. */
  const withChannels = (...names: string[]) => {
    const model = new RealtimeSurfaceStageModel();
    names.forEach((name) => model.Register(new TestChannel(name)));
    return model;
  };

  describe('creation', () => {
    it('creates no surface for a registered channel until it is seen', () => {
      const model = withChannels('Whiteboard');
      expect(model.Surfaces).toEqual([]);
      expect(placements(model)).toEqual({ Whiteboard: 'tab' });
    });

    it('creates a surface when its tab is shown, and keeps it when the tab is no longer shown', () => {
      const model = withChannels('Whiteboard');
      model.SetActiveTab('Whiteboard');
      expect(surfaces(model)).toEqual(['Whiteboard:tab']);
      model.SetActiveTab(null);
      expect(surfaces(model)).toEqual(['Whiteboard:tab']);
    });

    it('keeps registration order whatever order the surfaces were seen in', () => {
      const model = withChannels('Whiteboard', 'Media');
      model.SetActiveTab('Media');
      model.SetActiveTab('Whiteboard');
      expect(surfaces(model)).toEqual(['Whiteboard:tab', 'Media:tab']);
    });

    it('shows a tab that was active before its channel registered once it registers', () => {
      const model = new RealtimeSurfaceStageModel();
      model.SetActiveTab('Whiteboard');
      expect(model.Surfaces).toEqual([]);
      model.Register(new TestChannel('Whiteboard'));
      expect(surfaces(model)).toEqual(['Whiteboard:tab']);
    });

    it('drops the surface of a channel that left the session, and does not bring it back unseen', () => {
      const whiteboard = new TestChannel('Whiteboard');
      const media = new TestChannel('Media');
      const model = new RealtimeSurfaceStageModel();
      model.Register(whiteboard);
      model.Register(media);
      model.SetActiveTab('Whiteboard');
      model.SetActiveTab('Media');
      model.SetActiveTab(null);
      model.KeepOnly([media]);
      expect(surfaces(model)).toEqual(['Media:tab']);
      expect(model.PluginFor('Whiteboard')).toBeNull();
      model.Register(whiteboard);
      expect(surfaces(model)).toEqual(['Media:tab']);
    });

    it('follows a channel that comes back as a new plugin instance under the same key', () => {
      const before = new TestChannel('Whiteboard');
      const after = new TestChannel('Whiteboard');
      const model = new RealtimeSurfaceStageModel();
      model.Register(before);
      model.SetActiveTab('Whiteboard');
      model.KeepOnly([after]);
      model.Register(after);
      expect(model.PluginFor('Whiteboard')).toBe(after);
      expect(surfaces(model)).toEqual(['Whiteboard:tab']);
    });
  });

  describe('moves', () => {
    it('puts a surface on the stage, creating it if needed, and back on its tab', () => {
      const model = withChannels('Whiteboard', 'Media');
      model.SetActiveTab('Media');
      expect(model.Move('Whiteboard', 'stage')).toBe(true);
      expect(surfaces(model)).toEqual(['Whiteboard:stage', 'Media:tab']);
      expect(model.StageKey).toBe('Whiteboard');
      expect(model.Move('Whiteboard', 'tab')).toBe(true);
      expect(surfaces(model)).toEqual(['Whiteboard:tab', 'Media:tab']);
      expect(model.StageKey).toBeNull();
    });

    it('gives the stage to the latest surface moved there, and sends the one it displaces back to its tab', () => {
      const model = withChannels('Whiteboard', 'Media');
      model.Move('Whiteboard', 'stage');
      model.Move('Media', 'stage');
      expect(placements(model)).toEqual({ Whiteboard: 'tab', Media: 'stage' });
      expect(model.StageKey).toBe('Media');
    });

    it('hides a surface without creating it, and keeps a seen one alive while hidden', () => {
      const model = withChannels('Whiteboard', 'Media');
      model.Move('Media', 'hidden');
      model.SetActiveTab('Whiteboard');
      expect(surfaces(model)).toEqual(['Whiteboard:tab']);
      model.Move('Whiteboard', 'hidden');
      expect(surfaces(model)).toEqual(['Whiteboard:hidden']);
      expect(placements(model)).toEqual({ Whiteboard: 'hidden', Media: 'hidden' });
    });

    it('keeps one move per surface, the latest last, for the host to save', () => {
      const model = withChannels('Whiteboard', 'Media');
      model.Move('Whiteboard', 'stage');
      model.Move('Media', 'hidden');
      model.Move('Whiteboard', 'hidden');
      expect(model.Moves).toEqual([
        { SurfaceKey: 'Media', Placement: 'hidden' },
        { SurfaceKey: 'Whiteboard', Placement: 'hidden' },
      ]);
    });

    it('refuses a move for a channel not in the session, or to where it already is', () => {
      const model = withChannels('Whiteboard');
      expect(model.Move('Media', 'stage')).toBe(false);
      expect(model.Move('Whiteboard', 'tab')).toBe(false);
      expect(model.Moves).toEqual([]);
    });

    it('starts from a saved layout', () => {
      const model = new RealtimeSurfaceStageModel();
      model.LoadMoves([
        { SurfaceKey: 'Whiteboard', Placement: 'stage' },
        { SurfaceKey: 'Media', Placement: 'pip' },
      ]);
      model.Register(new TestChannel('Whiteboard'));
      model.Register(new TestChannel('Media'));
      expect(placements(model)).toEqual({ Whiteboard: 'stage', Media: 'pip' });
      expect(surfaces(model)).toEqual(['Whiteboard:stage', 'Media:pip']);
    });

    it('creates a picture-in-picture surface, stacks such surfaces newest first, and names each', () => {
      const model = withChannels('Whiteboard', 'Media', 'Browser');
      model.Move('Whiteboard', 'pip');
      model.Move('Media', 'pip');
      expect(model.Surfaces).toEqual([
        { Key: 'Whiteboard', Placement: 'pip', Label: 'Whiteboard', PipIndex: 1 },
        { Key: 'Media', Placement: 'pip', Label: 'Media', PipIndex: 0 },
      ]);
      model.Move('Whiteboard', 'pip');
      expect(model.Surfaces.map((s) => s.PipIndex)).toEqual([1, 0]);
      model.Move('Whiteboard', 'tab');
      model.Move('Whiteboard', 'pip');
      expect(model.Surfaces.map((s) => s.PipIndex)).toEqual([0, 1]);
    });

    it("keeps a channel's move when it leaves, so its surface returns to the same place", () => {
      const whiteboard = new TestChannel('Whiteboard');
      const model = new RealtimeSurfaceStageModel();
      model.Register(whiteboard);
      model.Move('Whiteboard', 'stage');
      model.KeepOnly([]);
      expect(model.StageKey).toBeNull();
      model.Register(new TestChannel('Whiteboard'));
      expect(model.StageKey).toBe('Whiteboard');
    });

    it('resets the layout: every surface returns to its tab', () => {
      const model = withChannels('Whiteboard', 'Media');
      model.Move('Whiteboard', 'stage');
      model.Move('Media', 'hidden');
      model.ResetLayout();
      expect(placements(model)).toEqual({ Whiteboard: 'tab', Media: 'tab' });
      expect(model.Moves).toEqual([]);
    });
  });

  describe("the channel's placement (its registry row's UIConfig)", () => {
    /** A channel whose registry row places its surface. */
    const placed = (name: string, Default: MediaStagePlacement, Allowed: readonly MediaStagePlacement[] = ANYWHERE) => {
      const channel = new TestChannel(name);
      channel.ApplySurfacePlacement({ Default, Allowed });
      return channel;
    };

    it('starts a surface where its channel places it, so a picture-in-picture surface is created at once', () => {
      const model = new RealtimeSurfaceStageModel();
      model.Register(new TestChannel('Whiteboard'));
      model.Register(placed('Camera', 'pip'));
      expect(placements(model)).toEqual({ Whiteboard: 'tab', Camera: 'pip' });
      expect(surfaces(model)).toEqual(['Camera:pip']);
    });

    it("refuses a move to a placement the channel does not allow, and lists where each channel's surface may go", () => {
      const model = new RealtimeSurfaceStageModel();
      model.Register(new TestChannel('Whiteboard'));
      model.Register(placed('Camera', 'pip', ['pip', 'hidden']));
      expect(model.Move('Camera', 'stage')).toBe(false);
      expect(model.Move('Camera', 'tab')).toBe(false);
      expect(model.Move('Camera', 'hidden')).toBe(true);
      expect(Object.fromEntries(model.AllowedPlacements)).toEqual({ Whiteboard: ANYWHERE, Camera: ['pip', 'hidden'] });
      expect(model.AllowedFor('Nobody')).toEqual([]);
    });

    it('ignores a saved move the channel does not allow', () => {
      const model = new RealtimeSurfaceStageModel();
      model.LoadMoves([{ SurfaceKey: 'Camera', Placement: 'stage' }]);
      model.Register(placed('Camera', 'pip', ['pip', 'hidden']));
      expect(placements(model)).toEqual({ Camera: 'pip' });
    });

    it('returns a surface to where its channel places it on a reset', () => {
      const model = new RealtimeSurfaceStageModel();
      model.Register(placed('Camera', 'pip'));
      model.Move('Camera', 'hidden');
      model.ResetLayout();
      expect(placements(model)).toEqual({ Camera: 'pip' });
    });

    it('sends a surface leaving the stage where its channel places it, or the first other placement it allows', () => {
      const model = new RealtimeSurfaceStageModel();
      model.Register(new TestChannel('Whiteboard'));
      model.Register(placed('Camera', 'pip'));
      model.Register(placed('Avatar', 'stage', ['stage', 'hidden']));
      expect(model.OffStagePlacement('Whiteboard')).toBe('tab');
      expect(model.OffStagePlacement('Camera')).toBe('pip');
      expect(model.OffStagePlacement('Avatar')).toBe('hidden');
    });
  });

  it('replaces the surfaces array and the placements maps only when something changes', () => {
    const whiteboard = new TestChannel('Whiteboard');
    const model = new RealtimeSurfaceStageModel();
    model.Register(whiteboard);
    model.SetActiveTab('Whiteboard');
    const shown = model.Surfaces;
    const placed = model.Placements;
    const allowed = model.AllowedPlacements;
    model.SetActiveTab(null);
    model.Register(whiteboard);
    model.KeepOnly([whiteboard]);
    expect(model.Surfaces).toBe(shown);
    expect(model.Placements).toBe(placed);
    expect(model.AllowedPlacements).toBe(allowed);
    model.Move('Whiteboard', 'stage');
    expect(model.Surfaces).not.toBe(shown);
    expect(model.Placements).not.toBe(placed);
    model.KeepOnly([]);
    expect(model.AllowedPlacements).not.toBe(allowed);
  });
});
