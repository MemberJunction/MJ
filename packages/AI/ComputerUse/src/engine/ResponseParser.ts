/**
 * Parses raw LLM text output into typed ControllerPromptResponse objects.
 *
 * Handles messy LLM output gracefully:
 * - Raw JSON
 * - JSON wrapped in markdown code blocks
 * - JSON with surrounding text
 * - Partial parse failures (preserves what can be parsed)
 *
 * Maps raw action JSON objects to the BrowserAction discriminated union
 * by instantiating the correct class based on the "Type" field.
 */

import {
    ControllerPromptResponse,
    ToolCallRequest,
} from '../types/controller.js';
import {
    BrowserAction,
    BoundingBox,
    ClickAction,
    TypeAction,
    ClickElementAction,
    TypeIntoElementAction,
    KeypressAction,
    KeyDownAction,
    KeyUpAction,
    ScrollAction,
    WaitAction,
    NavigateAction,
    GoBackAction,
    GoForwardAction,
    RefreshAction,
    DragAction,
} from '../types/browser.js';
import type { KeyModifier } from '../types/browser.js';

/** Shape of the raw JSON we expect from the controller LLM */
interface RawControllerResponse {
    reasoning?: string;
    actions?: RawAction[];
    toolCalls?: RawToolCall[];
    requestJudgement?: boolean;
    evaluation?: unknown;
    memory?: unknown;
    plan?: unknown;
}

interface RawAction {
    Type?: string;
    [key: string]: unknown;
}

interface RawToolCall {
    toolName?: string;
    arguments?: Record<string, unknown>;
}

export class ResponseParser {
    /**
     * Parse raw LLM text into a typed ControllerPromptResponse.
     * Never throws — returns a response with empty actions on failure.
     */
    public static ParseControllerResponse(rawText: string): ControllerPromptResponse {
        const response = new ControllerPromptResponse();
        response.RawResponse = rawText;

        const jsonStr = ResponseParser.extractJson(rawText);
        if (!jsonStr) {
            response.Reasoning = 'Failed to extract JSON from LLM response';
            return response;
        }

        try {
            const parsed = JSON.parse(jsonStr) as RawControllerResponse;

            response.Reasoning = parsed.reasoning ?? '';
            response.Actions = ResponseParser.parseActions(parsed.actions ?? []);
            response.ToolCalls = ResponseParser.parseToolCalls(parsed.toolCalls ?? []);
            response.RequestJudgement = parsed.requestJudgement ?? false;
            // Self-tracked agent state (CU-E2) — optional, tolerant of absence.
            response.Evaluation = ResponseParser.toStateString(parsed.evaluation);
            response.Memory = ResponseParser.toStateString(parsed.memory);
            response.Plan = ResponseParser.toStateString(parsed.plan);
        } catch {
            response.Reasoning = `JSON parse error on: ${jsonStr.slice(0, 200)}`;
        }

        return response;
    }

    /**
     * Map an array of raw action objects to typed BrowserAction instances.
     * Unrecognized action types are skipped (not crash-worthy).
     */
    private static parseActions(rawActions: RawAction[]): BrowserAction[] {
        const actions: BrowserAction[] = [];

        for (const raw of rawActions) {
            const action = ResponseParser.parseSingleAction(raw);
            if (action) {
                actions.push(action);
            }
        }

        return actions;
    }

    /**
     * Parse a single raw action object into a typed BrowserAction.
     * Returns null for unrecognized types.
     */
    private static parseSingleAction(raw: RawAction): BrowserAction | null {
        const type = raw.Type ?? raw.type;
        if (!type || typeof type !== 'string') return null;

        switch (type) {
            case 'Click': {
                const action = new ClickAction();
                action.X = ResponseParser.toNumber(raw.X ?? raw.x, 0);
                action.Y = ResponseParser.toNumber(raw.Y ?? raw.y, 0);
                action.BoundingBox = ResponseParser.parseBoundingBox(raw.BoundingBox ?? raw.boundingBox);
                action.Button = ResponseParser.toClickButton(raw.Button ?? raw.button);
                action.ClickCount = ResponseParser.toNumber(raw.ClickCount ?? raw.clickCount, 1);
                action.Selector = ResponseParser.toSelector(raw.Selector ?? raw.selector);
                action.Modifiers = ResponseParser.toKeyModifiers(raw.Modifiers ?? raw.modifiers);
                return action;
            }

            case 'Type': {
                const action = new TypeAction();
                action.Text = String(raw.Text ?? raw.text ?? '');
                action.Selector = ResponseParser.toSelector(raw.Selector ?? raw.selector);
                return action;
            }

            case 'ClickElement': {
                const action = new ClickElementAction();
                action.Index = ResponseParser.toNumber(raw.Index ?? raw.index, -1);
                action.ClickCount = ResponseParser.toNumber(raw.ClickCount ?? raw.clickCount, 1);
                action.Button = ResponseParser.toClickButton(raw.Button ?? raw.button);
                action.Modifiers = ResponseParser.toKeyModifiers(raw.Modifiers ?? raw.modifiers);
                return action;
            }

            case 'TypeIntoElement': {
                const action = new TypeIntoElementAction();
                action.Index = ResponseParser.toNumber(raw.Index ?? raw.index, -1);
                action.Text = String(raw.Text ?? raw.text ?? '');
                action.PressEnter = (raw.PressEnter ?? raw.pressEnter) === true;
                return action;
            }

            case 'Keypress': {
                const action = new KeypressAction();
                action.Key = String(raw.Key ?? raw.key ?? '');
                action.Modifiers = ResponseParser.toKeyModifiers(raw.Modifiers ?? raw.modifiers);
                return action;
            }

            case 'KeyDown': {
                const action = new KeyDownAction();
                action.Key = String(raw.Key ?? raw.key ?? '');
                return action;
            }

            case 'KeyUp': {
                const action = new KeyUpAction();
                action.Key = String(raw.Key ?? raw.key ?? '');
                return action;
            }

            case 'Scroll': {
                const action = new ScrollAction();
                action.DeltaY = ResponseParser.toNumber(raw.DeltaY ?? raw.deltaY, 0);
                action.DeltaX = ResponseParser.toNumber(raw.DeltaX ?? raw.deltaX, 0);
                action.Selector = ResponseParser.toSelector(raw.Selector ?? raw.selector);
                return action;
            }

            case 'Wait': {
                const action = new WaitAction();
                action.DurationMs = ResponseParser.toNumber(
                    raw.DurationMs ?? raw.durationMs ?? raw.ms,
                    1000
                );
                action.Selector = ResponseParser.toSelector(raw.Selector ?? raw.selector);
                return action;
            }

            case 'Navigate': {
                const action = new NavigateAction();
                action.Url = String(raw.Url ?? raw.url ?? '');
                return action;
            }

            case 'GoBack':
                return new GoBackAction();

            case 'GoForward':
                return new GoForwardAction();

            case 'Refresh':
                return new RefreshAction();

            case 'Drag': {
                const action = new DragAction();
                action.StartX = ResponseParser.toNumber(raw.StartX ?? raw.startX, 0);
                action.StartY = ResponseParser.toNumber(raw.StartY ?? raw.startY, 0);
                action.EndX = ResponseParser.toNumber(raw.EndX ?? raw.endX, 0);
                action.EndY = ResponseParser.toNumber(raw.EndY ?? raw.endY, 0);
                action.StartBoundingBox = ResponseParser.parseBoundingBox(
                    raw.StartBoundingBox ?? raw.startBoundingBox
                );
                action.EndBoundingBox = ResponseParser.parseBoundingBox(
                    raw.EndBoundingBox ?? raw.endBoundingBox
                );
                action.Steps = ResponseParser.toNumber(raw.Steps ?? raw.steps, 10);
                return action;
            }

            default:
                // Unrecognized action type — skip, don't crash
                return null;
        }
    }

    /**
     * Parse raw tool call objects into typed ToolCallRequest instances.
     */
    private static parseToolCalls(rawCalls: RawToolCall[]): ToolCallRequest[] {
        const calls: ToolCallRequest[] = [];

        for (const raw of rawCalls) {
            const name = raw.toolName ?? (raw as Record<string, unknown>).ToolName;
            if (!name || typeof name !== 'string') continue;

            const request = new ToolCallRequest();
            request.ToolName = name;
            request.Arguments = raw.arguments ?? (raw as Record<string, unknown>).Arguments as Record<string, unknown> ?? {};
            calls.push(request);
        }

        return calls;
    }

    // ─── JSON Extraction ───────────────────────────────────

    /**
     * Extract a JSON string from LLM output.
     * Handles markdown code blocks, raw JSON, and surrounded text.
     */
    private static extractJson(text: string): string | null {
        const trimmed = text.trim();

        // Try raw JSON (starts with {)
        if (trimmed.startsWith('{')) {
            return trimmed;
        }

        // Try markdown code block first
        const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
        if (codeBlockMatch) {
            return codeBlockMatch[1].trim();
        }

        // Find first { ... } block anywhere in text
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return jsonMatch[0];
        }

        return null;
    }

    // ─── Type Coercion Helpers ─────────────────────────────

    private static toNumber(value: unknown, defaultValue: number): number {
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return isNaN(parsed) ? defaultValue : parsed;
        }
        return defaultValue;
    }

    private static toClickButton(value: unknown): 'left' | 'right' | 'middle' {
        if (value === 'right') return 'right';
        if (value === 'middle') return 'middle';
        return 'left';
    }

    /**
     * Coerce a self-tracked-state value (CU-E2) into a trimmed non-empty string,
     * or undefined. Tolerant: a string is used as-is; an array is joined by
     * newlines (a checklist); any other object is JSON-stringified.
     */
    private static toStateString(value: unknown): string | undefined {
        if (value == null) return undefined;
        let text: string;
        if (typeof value === 'string') {
            text = value;
        } else if (Array.isArray(value)) {
            text = value.map(v => (typeof v === 'string' ? v : JSON.stringify(v))).join('\n');
        } else {
            text = JSON.stringify(value);
        }
        const trimmed = text.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    }

    /** Coerce a raw selector value into a trimmed non-empty string, or undefined (CU-A6). */
    private static toSelector(value: unknown): string | undefined {
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
                return trimmed;
            }
        }
        return undefined;
    }

    /**
     * Coerce a raw modifiers value into a `KeyModifier[]`, or undefined (CU-A6).
     * Accepts an array or a single string; keeps only recognized modifier names
     * (case-insensitively normalized to the canonical spelling).
     */
    private static toKeyModifiers(value: unknown): KeyModifier[] | undefined {
        const raw = Array.isArray(value) ? value : (value != null ? [value] : []);
        const canonical: Record<string, KeyModifier> = {
            shift: 'Shift',
            control: 'Control',
            ctrl: 'Control',
            alt: 'Alt',
            option: 'Alt',
            meta: 'Meta',
            cmd: 'Meta',
            command: 'Meta',
            controlormeta: 'ControlOrMeta',
        };
        const modifiers: KeyModifier[] = [];
        for (const entry of raw) {
            if (typeof entry === 'string') {
                const mapped = canonical[entry.trim().toLowerCase()];
                if (mapped && !modifiers.includes(mapped)) {
                    modifiers.push(mapped);
                }
            }
        }
        return modifiers.length > 0 ? modifiers : undefined;
    }

    /**
     * Parse a raw bounding box object into a typed BoundingBox.
     * Returns undefined if the input is missing or doesn't have the required fields.
     */
    private static parseBoundingBox(raw: unknown): BoundingBox | undefined {
        if (!raw || typeof raw !== 'object') return undefined;

        const obj = raw as Record<string, unknown>;
        const xMin = obj.XMin ?? obj.xMin ?? obj.xmin;
        const yMin = obj.YMin ?? obj.yMin ?? obj.ymin;
        const xMax = obj.XMax ?? obj.xMax ?? obj.xmax;
        const yMax = obj.YMax ?? obj.yMax ?? obj.ymax;

        // Require at least some bounding box values to be present
        if (xMin == null && yMin == null && xMax == null && yMax == null) return undefined;

        const box = new BoundingBox();
        box.XMin = ResponseParser.toNumber(xMin, 0);
        box.YMin = ResponseParser.toNumber(yMin, 0);
        box.XMax = ResponseParser.toNumber(xMax, 0);
        box.YMax = ResponseParser.toNumber(yMax, 0);
        return box;
    }
}
