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
    KeypressAction,
    KeyDownAction,
    KeyUpAction,
    ScrollAction,
    WaitAction,
    NavigateAction,
    GoBackAction,
    GoForwardAction,
    RefreshAction,
} from '../types/browser.js';

/** Shape of the raw JSON we expect from the controller LLM */
interface RawControllerResponse {
    reasoning?: string;
    actions?: RawAction[];
    toolCalls?: RawToolCall[];
    requestJudgement?: boolean;
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
                return action;
            }

            case 'Type': {
                const action = new TypeAction();
                action.Text = String(raw.Text ?? raw.text ?? '');
                return action;
            }

            case 'Keypress': {
                const action = new KeypressAction();
                action.Key = String(raw.Key ?? raw.key ?? '');
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
                return action;
            }

            case 'Wait': {
                const action = new WaitAction();
                action.DurationMs = ResponseParser.toNumber(
                    raw.DurationMs ?? raw.durationMs ?? raw.ms,
                    1000
                );
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
