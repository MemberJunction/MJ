// The Media / Remote Browser channels import standalone Angular surfaces whose partial-compiled libraries
// need the JIT compiler in this node test environment, so load it FIRST.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { REALTIME_CHANNEL_CONTRACT_VERSION } from '@memberjunction/ai-core-plus';
import { ClientContextChannel } from '../lib/components/realtime/channels/client-context-channel';
import { RealtimeWhiteboardChannel } from '../lib/components/realtime/whiteboard/whiteboard-channel';
import { RealtimeMediaChannel } from '../lib/components/realtime/media/media-channel';
import { RemoteBrowserChannel } from '../lib/components/realtime/remote-browser/remote-browser-channel';

/**
 * Descriptor contract for the four channels MJ ships. The point of these tests is the thing a descriptor
 * must never do: change what the model is told natively. Every verb is the channel's native tool, minus the
 * shared prefix, with the native tool name carried through — so the proxy and the native path reach the
 * same executor and no tool name moved.
 */
describe('shipped channel descriptors', () => {
  const channels = [
    { Name: 'Whiteboard', Channel: new RealtimeWhiteboardChannel(), Exposure: 'pixels' },
    { Name: 'Media', Channel: new RealtimeMediaChannel(), Exposure: 'state' },
    { Name: 'RemoteBrowser', Channel: new RemoteBrowserChannel(), Exposure: 'pixels' },
  ];

  for (const { Name, Channel, Exposure } of channels) {
    describe(Name, () => {
      it('is an authored (v2) descriptor keyed by the channel name', () => {
        const d = Channel.GetDescriptor();
        expect(d.Version).toBe(REALTIME_CHANNEL_CONTRACT_VERSION);
        expect(d.Key).toBe(Channel.ChannelName);
        expect(d.DisplayName).toBe(Channel.TabTitle);
        expect(d.Instructions.length).toBeGreaterThan(20);
      });

      it('keeps every native tool name exactly as it was, one verb per tool', () => {
        const d = Channel.GetDescriptor();
        const tools = Channel.GetToolDefinitions();
        expect(d.Verbs.map((v) => v.NativeToolName)).toEqual(tools.map((t) => t.Name));
        expect(d.Verbs.every((v) => v.Name.length > 0 && !v.Name.startsWith(Channel.ToolNamePrefix))).toBe(true);
        expect(d.Verbs.every((v) => v.InvokableBy === 'agent')).toBe(true);
        expect(d.Verbs.map((v) => v.ParametersSchema)).toEqual(tools.map((t) => t.ParametersSchema));
      });

      it('preserves today\'s scoping: on for every session, mounted with the session, and the right exposure ceiling', () => {
        const d = Channel.GetDescriptor();
        expect(d.DefaultAvailability).toBe('all-sessions');
        expect(d.DisplayPolicy).toBe('open-on-start');
        expect(d.MaxExposure).toBe(Exposure);
      });
    });
  }

  it('the whiteboard names its state and the events it emits', () => {
    const d = new RealtimeWhiteboardChannel().GetDescriptor();
    expect(d.Nouns.map((n) => n.Name)).toEqual(['pages']);
    expect(d.Events?.map((e) => e.Name)).toEqual(['state_changed', 'frame_pushed']);
  });

  it('a subclass that adds a tool gets a verb for it automatically (the descriptor cannot lie)', () => {
    class ExtendedBoard extends RealtimeWhiteboardChannel {
      public override GetToolDefinitions() {
        return [...super.GetToolDefinitions(), { Name: 'Whiteboard_Extra', Description: 'extra', ParametersSchema: { type: 'object' } }];
      }
    }
    const verbs = new ExtendedBoard().GetDescriptor().Verbs;
    expect(verbs.at(-1)).toMatchObject({ Name: 'Extra', NativeToolName: 'Whiteboard_Extra' });
  });

  it('every shipped channel is reachable through the proxy path: its verbs resolve back to native tool names', () => {
    for (const { Channel } of channels) {
      const d = Channel.GetDescriptor();
      expect(new Set(d.Verbs.map((v) => v.Name)).size).toBe(d.Verbs.length); // no verb-name collisions after prefix stripping
    }
  });

  it('the client-context proxy keeps its single stable tool and exposes no verbs', () => {
    const ch = new ClientContextChannel();
    expect(ch.GetToolDefinitions().map((t) => t.Name)).toEqual(['ContextTool']);
    expect(ch.GetDescriptor().Verbs).toEqual([]);
  });
});
