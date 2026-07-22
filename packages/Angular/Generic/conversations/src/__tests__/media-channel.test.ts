// The Media channel imports its standalone Angular surface component (partial-compiled Angular libs
// require the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect, beforeEach } from 'vitest';
import { IMetadataProvider } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { BaseRealtimeChannelClient, RealtimeChannelContext } from '../lib/components/realtime/channels/base-realtime-channel-client';
import { LoadRealtimeMediaChannel, RealtimeMediaChannel } from '../lib/components/realtime/media/media-channel';
import { MediaChannelState, MediaItem } from '../lib/components/realtime/media/media-channel-state';
import { MEDIA_TOOL_NAMES } from '../lib/components/realtime/media/media-channel-tools';
import {
  RealtimeMediaSurfaceComponent, RouteForMediaItem, IsPlayerMediaType
} from '../lib/components/realtime/media/realtime-media-surface.component';

LoadRealtimeMediaChannel();

interface CtxLog {
  Notes: string[];
  Saves: string[];
}

/** A minimal fake provider — only its identity matters for the threading test. */
const fakeProvider = { /* identity marker */ } as unknown as IMetadataProvider;

function makeContext(log: CtxLog, provider: IMetadataProvider | null = fakeProvider): RealtimeChannelContext {
  return {
    AgentName: 'Sage',
    Provider: provider,
    SendContextNote: (text: string) => log.Notes.push(text),
    RequestSave: (stateJson: string) => log.Saves.push(stateJson),
    SetFocusMode: () => undefined,
    SaveAsArtifact: async () => null,
    AgentSessionID: null,
    ExecuteServerAction: async () => null,
  };
}

/** Parses a `Media_*` tool result string into a typed object. */
function parseResult(raw: string): { success: boolean; id?: string; error?: string } {
  return JSON.parse(raw) as { success: boolean; id?: string; error?: string };
}

describe('RealtimeMediaChannel — MJStorage file support', () => {
  let channel: RealtimeMediaChannel;
  let log: CtxLog;

  beforeEach(() => {
    channel = new RealtimeMediaChannel();
    log = { Notes: [], Saves: [] };
    channel.Initialize(makeContext(log));
  });

  it('is resolvable from the ClassFactory by its registry ClientPluginClass key', () => {
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseRealtimeChannelClient>(
      BaseRealtimeChannelClient, 'RealtimeMediaChannel'
    );
    expect(instance).toBeInstanceOf(RealtimeMediaChannel);
  });

  // --- Tool contract: source is url OR fileId, at least one required -----------

  it('Media_ShowMedia accepts a fileId WITHOUT a url (MJStorage file)', () => {
    const result = parseResult(channel.ApplyAgentTool(MEDIA_TOOL_NAMES.ShowMedia, JSON.stringify({
      mediaType: 'image', fileId: 'FILE-A', displayName: 'Chart',
    })));
    expect(result.success).toBe(true);
    expect(result.id).toBeTruthy();

    const item = channel.State.Items.find((i) => i.Id === result.id)!;
    expect(item.FileID).toBe('FILE-A');
    expect(item.Url).toBeUndefined();
    expect(channel.State.ActiveItemId).toBe(item.Id);
  });

  it('Media_ShowMedia still accepts a url WITHOUT a fileId (external/public asset)', () => {
    const result = parseResult(channel.ApplyAgentTool(MEDIA_TOOL_NAMES.ShowMedia, JSON.stringify({
      mediaType: 'web', url: 'https://example.com', displayName: 'Site',
    })));
    expect(result.success).toBe(true);
    const item = channel.State.Items.find((i) => i.Id === result.id)!;
    expect(item.Url).toBe('https://example.com');
    expect(item.FileID).toBeUndefined();
  });

  it('Media_ShowMedia REJECTS when neither url nor fileId is given', () => {
    const result = parseResult(channel.ApplyAgentTool(MEDIA_TOOL_NAMES.ShowMedia, JSON.stringify({
      mediaType: 'image', displayName: 'No source',
    })));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/url.*fileId|fileId.*url/i);
    expect(channel.State.Items).toHaveLength(0);
  });

  it('Media_ShowMedia still rejects a missing/invalid mediaType even with a fileId', () => {
    const result = parseResult(channel.ApplyAgentTool(MEDIA_TOOL_NAMES.ShowMedia, JSON.stringify({
      fileId: 'FILE-A', displayName: 'X',
    })));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/mediaType/i);
  });

  // --- Tool schema reflects the new contract ----------------------------------

  it('the ShowMedia tool no longer marks url as required (only mediaType + displayName)', () => {
    const def = channel.GetToolDefinitions().find((d) => d.Name === MEDIA_TOOL_NAMES.ShowMedia)!;
    const required = (def.ParametersSchema as { required?: string[] }).required ?? [];
    expect(required).toContain('mediaType');
    expect(required).toContain('displayName');
    expect(required).not.toContain('url');
  });

  // --- Provider threading ------------------------------------------------------

  it('BindSurface threads the live session provider into the surface', () => {
    const surface = new SurfaceStub();
    channel.BindSurface(surface as unknown as RealtimeMediaSurfaceComponent);
    expect(surface.Provider).toBe(fakeProvider);
    expect(surface.State).toBe(channel.State);
    expect(surface.AgentName).toBe('Sage');
  });

  it('BindSurface tolerates a null provider (falls back to global at the surface)', () => {
    const ch = new RealtimeMediaChannel();
    ch.Initialize(makeContext({ Notes: [], Saves: [] }, null));
    const surface = new SurfaceStub();
    ch.BindSurface(surface as unknown as RealtimeMediaSurfaceComponent);
    expect(surface.Provider).toBeNull();
  });
});

/** Structural stand-in for the bound surface — only the inputs BindSurface sets. */
class SurfaceStub {
  public State: MediaChannelState | null = null;
  public AgentName = '';
  public Provider: IMetadataProvider | null = null;
}

describe('MediaChannelState — FileID round-trip + validation', () => {
  it('serializes and rehydrates a FileID-backed item (no Url)', () => {
    const a = new MediaChannelState();
    a.AddItem({ Type: 'video', FileID: 'FILE-V', DisplayName: 'Recording' });
    a.AddItem({ Type: 'image', Url: 'https://example.com/x.png', DisplayName: 'Pic' });

    const json = a.ToJSON();
    const b = new MediaChannelState();
    expect(b.LoadFromJSON(json)).toBe(true);
    expect(b.Items).toHaveLength(2);

    const restored = b.Items.find((i) => i.FileID === 'FILE-V')!;
    expect(restored).toBeTruthy();
    expect(restored.Type).toBe('video');
    expect(restored.Url).toBeUndefined();
  });

  it('drops a hand-edited item with NEITHER Url nor FileID (defensive validation)', () => {
    const noSource: Partial<MediaItem> = { Id: 'x', Type: 'image', DisplayName: 'broken' };
    const payload = JSON.stringify({ V: 1, Items: [noSource], ActiveItemId: 'x' });
    const s = new MediaChannelState();
    expect(s.LoadFromJSON(payload)).toBe(true);
    expect(s.Items).toHaveLength(0);
  });

  it('keeps an item that has only a FileID (FileID alone is a valid source)', () => {
    const item: Partial<MediaItem> = { Id: 'f', Type: 'audio', FileID: 'FILE-A', DisplayName: 'clip' };
    const payload = JSON.stringify({ V: 1, Items: [item], ActiveItemId: 'f' });
    const s = new MediaChannelState();
    expect(s.LoadFromJSON(payload)).toBe(true);
    expect(s.Items).toHaveLength(1);
    expect(s.Items[0].FileID).toBe('FILE-A');
  });
});

describe('RouteForMediaItem — surface render routing (pure)', () => {
  const item = (over: Partial<MediaItem>): MediaItem =>
    ({ Id: 'i', Type: 'image', DisplayName: 'n', ...over } as MediaItem);

  it('audio/video + FileID → storage player', () => {
    expect(RouteForMediaItem(item({ Type: 'audio', FileID: 'F' }))).toBe('storage-player');
    expect(RouteForMediaItem(item({ Type: 'video', FileID: 'F' }))).toBe('storage-player');
  });

  it('audio/video + Url only → url player', () => {
    expect(RouteForMediaItem(item({ Type: 'audio', Url: 'http://a' }))).toBe('url-player');
    expect(RouteForMediaItem(item({ Type: 'video', Url: 'http://a' }))).toBe('url-player');
  });

  it('FileID wins over Url for audio/video (secure streaming preferred)', () => {
    expect(RouteForMediaItem(item({ Type: 'video', FileID: 'F', Url: 'http://a' }))).toBe('storage-player');
  });

  it('image/pdf/web → iframe-or-img for both Url and FileID sources', () => {
    expect(RouteForMediaItem(item({ Type: 'image', Url: 'http://a' }))).toBe('iframe-or-img');
    expect(RouteForMediaItem(item({ Type: 'image', FileID: 'F' }))).toBe('iframe-or-img');
    expect(RouteForMediaItem(item({ Type: 'pdf', FileID: 'F' }))).toBe('iframe-or-img');
    expect(RouteForMediaItem(item({ Type: 'web', Url: 'http://a' }))).toBe('iframe-or-img');
  });

  it('no usable source → none', () => {
    expect(RouteForMediaItem(item({ Type: 'image' }))).toBe('none');
    expect(RouteForMediaItem(item({ Type: 'audio' }))).toBe('none');
  });

  it('IsPlayerMediaType distinguishes audio/video from img/iframe types', () => {
    expect(IsPlayerMediaType(item({ Type: 'audio' }))).toBe(true);
    expect(IsPlayerMediaType(item({ Type: 'video' }))).toBe(true);
    expect(IsPlayerMediaType(item({ Type: 'image' }))).toBe(false);
    expect(IsPlayerMediaType(item({ Type: 'pdf' }))).toBe(false);
    expect(IsPlayerMediaType(item({ Type: 'web' }))).toBe(false);
  });
});
