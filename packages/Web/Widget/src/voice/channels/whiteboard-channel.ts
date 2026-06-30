/**
 * @fileoverview Framework-free **Whiteboard** interactive channel for the public web widget — the
 * worked example that makes "the mic opens MJ channel support" literally true. While voice is active,
 * the agent can sketch/annotate a shared canvas the visitor watches fill in.
 *
 * It speaks the SAME channel protocol as Explorer's `RealtimeWhiteboardChannel` (a `Whiteboard_`-prefixed
 * client tool set the model calls), but renders to a dependency-free inline-SVG surface instead of the
 * Angular host component — so it mounts inside the widget's shadow DOM with zero framework weight. The
 * coordinate space is a fixed 1000×600 viewBox the SVG scales to its container.
 *
 * @module @memberjunction/web-widget
 */

import { RegisterClass } from '@memberjunction/global';
import { BaseWidgetChannel, type WidgetChannelToolDefinition } from './base-widget-channel.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 600;
/** Channel name + tool prefix — kept in sync with the `MJ: AI Agent Channels` "Whiteboard" row. */
const CHANNEL_NAME = 'Whiteboard';
const TOOL_PREFIX = 'Whiteboard_';
const DEFAULT_STROKE = '#264FAF';

/** A number-or-undefined coercion that tolerates the model sending numbers as strings. */
function num(value: unknown, fallback = 0): number {
    const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(n) ? n : fallback;
}

/** Coerces a model-supplied color to a safe string (rejects anything but a short hex / css-name token). */
function safeColor(value: unknown): string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$|^[a-zA-Z]{3,20}$/.test(value.trim())
        ? value.trim()
        : DEFAULT_STROKE;
}

/**
 * The framework-free Whiteboard channel. Renders agent-issued shapes/text into an inline SVG and
 * reports each applied tool back to the model. Resolved via ClassFactory by the channel name.
 */
@RegisterClass(BaseWidgetChannel, CHANNEL_NAME)
export class WidgetWhiteboardChannel extends BaseWidgetChannel {
    private svg: SVGSVGElement | null = null;
    private shapeCount = 0;

    public get ChannelName(): string {
        return CHANNEL_NAME;
    }
    public get ToolNamePrefix(): string {
        return TOOL_PREFIX;
    }
    public get SurfaceTitle(): string {
        return 'Whiteboard';
    }

    public GetToolDefinitions(): WidgetChannelToolDefinition[] {
        const xy = { x: { type: 'number' }, y: { type: 'number' } };
        const color = { color: { type: 'string', description: 'Hex (e.g. #264FAF) or CSS color name.' } };
        return [
            {
                Name: `${TOOL_PREFIX}AddText`,
                Description: 'Write a line of text on the shared whiteboard at (x,y) in a 1000x600 canvas.',
                ParametersSchema: { type: 'object', properties: { ...xy, text: { type: 'string' }, ...color }, required: ['x', 'y', 'text'] },
            },
            {
                Name: `${TOOL_PREFIX}DrawRect`,
                Description: 'Draw a rectangle outline at (x,y) with width/height on the 1000x600 canvas.',
                ParametersSchema: {
                    type: 'object',
                    properties: { ...xy, width: { type: 'number' }, height: { type: 'number' }, ...color },
                    required: ['x', 'y', 'width', 'height'],
                },
            },
            {
                Name: `${TOOL_PREFIX}DrawLine`,
                Description: 'Draw a line from (x1,y1) to (x2,y2) on the 1000x600 canvas.',
                ParametersSchema: {
                    type: 'object',
                    properties: { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' }, ...color },
                    required: ['x1', 'y1', 'x2', 'y2'],
                },
            },
            {
                Name: `${TOOL_PREFIX}DrawCircle`,
                Description: 'Draw a circle outline centered at (cx,cy) with radius r on the 1000x600 canvas.',
                ParametersSchema: {
                    type: 'object',
                    properties: { cx: { type: 'number' }, cy: { type: 'number' }, r: { type: 'number' }, ...color },
                    required: ['cx', 'cy', 'r'],
                },
            },
            {
                Name: `${TOOL_PREFIX}Clear`,
                Description: 'Erase everything on the whiteboard.',
                ParametersSchema: { type: 'object', properties: {} },
            },
        ];
    }

    public ApplyAgentTool(toolName: string, argsJson: string): string {
        if (!this.svg) {
            return JSON.stringify({ error: 'whiteboard surface not ready' });
        }
        let args: Record<string, unknown>;
        try {
            args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {};
        } catch {
            return JSON.stringify({ error: 'invalid tool arguments JSON' });
        }
        const bare = toolName.startsWith(TOOL_PREFIX) ? toolName.slice(TOOL_PREFIX.length) : toolName;
        switch (bare) {
            case 'AddText':
                return this.addText(args);
            case 'DrawRect':
                return this.drawRect(args);
            case 'DrawLine':
                return this.drawLine(args);
            case 'DrawCircle':
                return this.drawCircle(args);
            case 'Clear':
                return this.clear();
            default:
                return JSON.stringify({ error: `unknown whiteboard tool: ${toolName}` });
        }
    }

    public BindSurface(host: HTMLElement): void {
        host.innerHTML = '';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', 'Shared whiteboard the assistant draws on');
        host.appendChild(svg);
        this.svg = svg;
        this.shapeCount = 0;
    }

    public override Dispose(): void {
        this.svg = null;
        this.shapeCount = 0;
        super.Dispose();
    }

    // ── tool handlers ───────────────────────────────────────────────────────────

    private addText(args: Record<string, unknown>): string {
        const text = typeof args.text === 'string' ? args.text : '';
        if (!text) {
            return JSON.stringify({ error: 'text is required' });
        }
        const el = document.createElementNS(SVG_NS, 'text');
        el.setAttribute('x', String(num(args.x)));
        el.setAttribute('y', String(num(args.y)));
        el.setAttribute('fill', safeColor(args.color));
        el.setAttribute('font-size', '24');
        el.textContent = text;
        return this.add(el, `wrote "${text}"`);
    }

    private drawRect(args: Record<string, unknown>): string {
        const el = document.createElementNS(SVG_NS, 'rect');
        el.setAttribute('x', String(num(args.x)));
        el.setAttribute('y', String(num(args.y)));
        el.setAttribute('width', String(num(args.width)));
        el.setAttribute('height', String(num(args.height)));
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', safeColor(args.color));
        el.setAttribute('stroke-width', '3');
        return this.add(el, 'drew a rectangle');
    }

    private drawLine(args: Record<string, unknown>): string {
        const el = document.createElementNS(SVG_NS, 'line');
        el.setAttribute('x1', String(num(args.x1)));
        el.setAttribute('y1', String(num(args.y1)));
        el.setAttribute('x2', String(num(args.x2)));
        el.setAttribute('y2', String(num(args.y2)));
        el.setAttribute('stroke', safeColor(args.color));
        el.setAttribute('stroke-width', '3');
        return this.add(el, 'drew a line');
    }

    private drawCircle(args: Record<string, unknown>): string {
        const el = document.createElementNS(SVG_NS, 'circle');
        el.setAttribute('cx', String(num(args.cx)));
        el.setAttribute('cy', String(num(args.cy)));
        el.setAttribute('r', String(num(args.r)));
        el.setAttribute('fill', 'none');
        el.setAttribute('stroke', safeColor(args.color));
        el.setAttribute('stroke-width', '3');
        return this.add(el, 'drew a circle');
    }

    private clear(): string {
        if (this.svg) {
            this.svg.innerHTML = '';
        }
        this.shapeCount = 0;
        return JSON.stringify({ ok: true, cleared: true });
    }

    /** Appends an SVG node, bumps the shape count, notes the activity, and returns the result JSON. */
    private add(node: SVGElement, description: string): string {
        this.svg!.appendChild(node);
        this.shapeCount++;
        // No perception note here: the AGENT issued this, so it already knows. SendContextNote is for
        // USER-originated activity (a later enhancement once the surface accepts visitor input).
        return JSON.stringify({ ok: true, action: description, shapeCount: this.shapeCount });
    }
}

/** Tree-shaking guard — importing this module performs the `@RegisterClass` registration as a side effect. */
export function LoadWidgetWhiteboardChannel(): void {
    /* intentional no-op */
}
