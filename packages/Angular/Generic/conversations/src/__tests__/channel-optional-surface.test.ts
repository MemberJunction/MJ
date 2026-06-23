/**
 * Unit tests for the OPTIONAL CLIENT SURFACE contract on {@link BaseRealtimeChannelClient} (Phase 2).
 *
 * A bridge-contributed channel (e.g. meeting-controls or a platform-native whiteboard) may be
 * SERVER-ONLY — no MJ Angular surface. The contract change makes `GetSurfaceComponent` optional
 * (defaults to `null`) and adds `HasSurface()` so the overlay can skip a surfaceless channel's tab
 * while still wiring its tools + perception. These tests pin both the server-only default and the
 * surface-bearing override, without rendering Angular.
 */
import { describe, it, expect } from 'vitest';
import type { Type } from '@angular/core';
import { RealtimeToolDefinition } from '@memberjunction/ai';
import { BaseRealtimeChannelClient } from '../lib/components/realtime/channels/base-realtime-channel-client';

/** A server-only channel: contributes tools + perception, but renders NO surface. */
class ServerOnlyChannel extends BaseRealtimeChannelClient {
  public get ChannelName(): string { return 'ServerOnly'; }
  public get ToolNamePrefix(): string { return 'ServerOnly_'; }
  public get TabTitle(): string { return 'Server Only'; }
  public get TabIcon(): string { return 'fa-solid fa-gear'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] {
    return [{ Name: 'ServerOnly_Do', Description: 'do', ParametersSchema: { type: 'object' } }];
  }
  public ApplyAgentTool(): string { return JSON.stringify({ success: true }); }
  public BindSurface(): void { /* never called — no surface */ }
  // Deliberately does NOT override GetSurfaceComponent — inherits the null default.
}

/** A surface-bearing channel for the positive case. */
class FakeSurface {}
class SurfaceChannel extends BaseRealtimeChannelClient<FakeSurface> {
  public get ChannelName(): string { return 'WithSurface'; }
  public get ToolNamePrefix(): string { return 'WithSurface_'; }
  public get TabTitle(): string { return 'With Surface'; }
  public get TabIcon(): string { return 'fa-solid fa-chalkboard'; }
  public GetToolDefinitions(): RealtimeToolDefinition[] { return []; }
  public ApplyAgentTool(): string { return '{}'; }
  public BindSurface(): void { /* no-op */ }
  public override GetSurfaceComponent(): Type<FakeSurface> { return FakeSurface; }
}

describe('BaseRealtimeChannelClient — optional client surface', () => {
  it('a server-only channel returns null from GetSurfaceComponent and false from HasSurface', () => {
    const ch = new ServerOnlyChannel();
    expect(ch.GetSurfaceComponent()).toBeNull();
    expect(ch.HasSurface()).toBe(false);
  });

  it('a server-only channel still contributes tools (tools/perception are unaffected by no surface)', () => {
    const ch = new ServerOnlyChannel();
    expect(ch.GetToolDefinitions().map((t) => t.Name)).toEqual(['ServerOnly_Do']);
  });

  it('a surface-bearing channel returns its component and reports HasSurface true', () => {
    const ch = new SurfaceChannel();
    expect(ch.GetSurfaceComponent()).toBe(FakeSurface);
    expect(ch.HasSurface()).toBe(true);
  });
});
