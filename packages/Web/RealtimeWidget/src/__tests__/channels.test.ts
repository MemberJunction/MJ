import { describe, it, expect, beforeEach } from 'vitest';
import { WidgetWhiteboardChannel, LoadWidgetWhiteboardChannel } from '../voice/channels/whiteboard-channel.js';
import { WidgetChannelHost } from '../voice/channels/widget-channel-host.js';
import type { WidgetChannelContext } from '../voice/channels/base-widget-channel.js';

// Ensure the @RegisterClass side effect has run so the host can resolve 'Whiteboard' via the ClassFactory.
LoadWidgetWhiteboardChannel();

const noopContext: WidgetChannelContext = { SendContextNote: () => undefined };

describe('WidgetWhiteboardChannel — tool definitions', () => {
    it('exposes prefixed tools the model can call', () => {
        const wb = new WidgetWhiteboardChannel();
        const names = wb.GetToolDefinitions().map((t) => t.Name);
        expect(wb.ChannelName).toBe('Whiteboard');
        expect(wb.ToolNamePrefix).toBe('Whiteboard_');
        expect(names).toContain('Whiteboard_AddText');
        expect(names).toContain('Whiteboard_DrawRect');
        expect(names).toContain('Whiteboard_Clear');
        // Every tool name is correctly prefixed (so the host routes them).
        expect(names.every((n) => n.startsWith('Whiteboard_'))).toBe(true);
    });
});

describe('WidgetWhiteboardChannel — ApplyAgentTool', () => {
    let wb: WidgetWhiteboardChannel;
    let host: HTMLElement;

    beforeEach(() => {
        wb = new WidgetWhiteboardChannel();
        host = document.createElement('div');
        wb.BindSurface(host);
    });

    it('renders text onto the surface and reports the action', () => {
        const result = JSON.parse(wb.ApplyAgentTool('Whiteboard_AddText', JSON.stringify({ x: 10, y: 20, text: 'Hello' })));
        expect(result.ok).toBe(true);
        expect(result.shapeCount).toBe(1);
        const svg = host.querySelector('svg');
        expect(svg?.querySelector('text')?.textContent).toBe('Hello');
    });

    it('renders a rectangle', () => {
        const result = JSON.parse(wb.ApplyAgentTool('Whiteboard_DrawRect', JSON.stringify({ x: 0, y: 0, width: 100, height: 50 })));
        expect(result.ok).toBe(true);
        expect(host.querySelector('svg rect')).not.toBeNull();
    });

    it('clears the surface', () => {
        wb.ApplyAgentTool('Whiteboard_DrawRect', JSON.stringify({ x: 0, y: 0, width: 10, height: 10 }));
        const result = JSON.parse(wb.ApplyAgentTool('Whiteboard_Clear', '{}'));
        expect(result.cleared).toBe(true);
        expect(host.querySelector('svg rect')).toBeNull();
    });

    it('returns an error for malformed argument JSON (never throws)', () => {
        const result = JSON.parse(wb.ApplyAgentTool('Whiteboard_AddText', '{not json'));
        expect(result.error).toBeTruthy();
    });

    it('returns an error for an unknown tool', () => {
        const result = JSON.parse(wb.ApplyAgentTool('Whiteboard_Explode', '{}'));
        expect(result.error).toContain('unknown');
    });

    it('reports surface-not-ready before BindSurface', () => {
        const fresh = new WidgetWhiteboardChannel();
        const result = JSON.parse(fresh.ApplyAgentTool('Whiteboard_Clear', '{}'));
        expect(result.error).toContain('not ready');
    });
});

describe('WidgetChannelHost — resolution + routing', () => {
    it('resolves an enabled channel via the ClassFactory', () => {
        const host = new WidgetChannelHost(['Whiteboard'], noopContext);
        expect(host.HasChannels).toBe(true);
        expect(host.Channels[0].ChannelName).toBe('Whiteboard');
    });

    it('is inert for an empty channel list (the default)', () => {
        const host = new WidgetChannelHost([], noopContext);
        expect(host.HasChannels).toBe(false);
        expect(host.GetToolDefinitions()).toEqual([]);
    });

    it('skips an unregistered channel name without throwing', () => {
        const host = new WidgetChannelHost(['NoSuchChannel'], noopContext);
        expect(host.HasChannels).toBe(false);
    });

    it('aggregates tool definitions across channels', () => {
        const host = new WidgetChannelHost(['Whiteboard'], noopContext);
        expect(host.GetToolDefinitions().some((t) => t.Name === 'Whiteboard_AddText')).toBe(true);
    });

    it('FindChannel matches by tool-name prefix and misses for unknown tools', () => {
        const host = new WidgetChannelHost(['Whiteboard'], noopContext);
        expect(host.FindChannel('Whiteboard_DrawLine')?.ChannelName).toBe('Whiteboard');
        expect(host.FindChannel('invoke-target-agent')).toBeUndefined();
    });

    it('RouteTool applies a channel tool and reports unhandled for non-channel tools', () => {
        const host = new WidgetChannelHost(['Whiteboard'], noopContext);
        const surface = document.createElement('div');
        host.BindSurface(host.Channels[0], surface);

        const routed = host.RouteTool('Whiteboard_AddText', JSON.stringify({ x: 1, y: 2, text: 'hi' }));
        expect(routed.handled).toBe(true);
        expect(JSON.parse(routed.resultJson ?? '{}').ok).toBe(true);

        const passthrough = host.RouteTool('invoke-target-agent', '{}');
        expect(passthrough.handled).toBe(false);
    });
});
