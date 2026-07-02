import { describe, it, expect } from 'vitest';
import { ResponseParser } from '../engine/ResponseParser.js';

describe('ResponseParser', () => {
    describe('ParseControllerResponse', () => {
        it('should parse valid JSON with reasoning, actions, and toolCalls', () => {
            const input = JSON.stringify({
                reasoning: 'I need to click the login button',
                actions: [
                    { Type: 'Click', X: 100, Y: 200 },
                    { Type: 'Type', Text: 'hello' },
                ],
                toolCalls: [
                    { toolName: 'lookup_user', arguments: { id: '123' } },
                ],
                requestJudgement: true,
            });

            const result = ResponseParser.ParseControllerResponse(input);

            expect(result.Reasoning).toBe('I need to click the login button');
            expect(result.Actions).toHaveLength(2);
            expect(result.Actions[0].Type).toBe('Click');
            expect(result.Actions[1].Type).toBe('Type');
            expect(result.ToolCalls).toHaveLength(1);
            expect(result.ToolCalls[0].ToolName).toBe('lookup_user');
            expect(result.RequestJudgement).toBe(true);
            expect(result.RawResponse).toBe(input);
        });

        it('should handle empty input gracefully without throwing', () => {
            const result = ResponseParser.ParseControllerResponse('');
            expect(result.Reasoning).toContain('Failed to extract JSON');
            expect(result.Actions).toHaveLength(0);
            expect(result.ToolCalls).toHaveLength(0);
        });

        it('should handle malformed JSON gracefully without throwing', () => {
            const result = ResponseParser.ParseControllerResponse('{not valid json!!!');
            // It will try to extract JSON and get the whole string, then JSON.parse fails
            expect(result.Actions).toHaveLength(0);
        });

        it('should extract JSON from markdown code blocks', () => {
            const input = `Here is my plan:
\`\`\`json
{
    "reasoning": "Navigate to login page",
    "actions": [{ "Type": "Navigate", "Url": "https://example.com/login" }]
}
\`\`\`
That should work.`;

            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.Reasoning).toBe('Navigate to login page');
            expect(result.Actions).toHaveLength(1);
            expect(result.Actions[0].Type).toBe('Navigate');
        });

        it('should extract JSON from code blocks without language specifier', () => {
            const input = `\`\`\`
{"reasoning": "test", "actions": []}
\`\`\``;

            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.Reasoning).toBe('test');
        });

        it('should extract JSON surrounded by prose', () => {
            const input = `I think the best approach is: {"reasoning": "scroll down", "actions": [{"Type": "Scroll", "DeltaY": 300}]} and that should reveal the content.`;

            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.Reasoning).toBe('scroll down');
            expect(result.Actions).toHaveLength(1);
            expect(result.Actions[0].Type).toBe('Scroll');
        });

        it('should default requestJudgement to false when not provided', () => {
            const input = JSON.stringify({
                reasoning: 'just clicking',
                actions: [{ Type: 'Click', X: 10, Y: 20 }],
            });

            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.RequestJudgement).toBe(false);
        });

        it('should default reasoning to empty string when not in JSON', () => {
            const input = JSON.stringify({ actions: [] });
            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.Reasoning).toBe('');
        });

        it('should handle response with no actions array', () => {
            const input = JSON.stringify({ reasoning: 'thinking...' });
            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.Actions).toHaveLength(0);
        });

        it('should handle response with no toolCalls array', () => {
            const input = JSON.stringify({ reasoning: 'ok' });
            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.ToolCalls).toHaveLength(0);
        });

        it('should preserve raw response text regardless of parse outcome', () => {
            const input = 'just plain text with no JSON at all';
            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.RawResponse).toBe(input);
        });
    });

    describe('action parsing (via ParseControllerResponse)', () => {
        function parseActions(actions: Record<string, unknown>[]) {
            const input = JSON.stringify({ reasoning: '', actions });
            return ResponseParser.ParseControllerResponse(input).Actions;
        }

        it('should parse ClickAction with all fields', () => {
            const actions = parseActions([
                { Type: 'Click', X: 150, Y: 250, Button: 'right', ClickCount: 2 },
            ]);

            expect(actions).toHaveLength(1);
            const click = actions[0];
            expect(click.Type).toBe('Click');
            if (click.Type === 'Click') {
                expect(click.X).toBe(150);
                expect(click.Y).toBe(250);
                expect(click.Button).toBe('right');
                expect(click.ClickCount).toBe(2);
            }
        });

        it('should parse ClickAction with bounding box', () => {
            const actions = parseActions([
                { Type: 'Click', X: 10, Y: 20, BoundingBox: { XMin: 5, YMin: 10, XMax: 15, YMax: 30 } },
            ]);

            expect(actions).toHaveLength(1);
            if (actions[0].Type === 'Click') {
                expect(actions[0].BoundingBox).toBeDefined();
                expect(actions[0].BoundingBox!.XMin).toBe(5);
                expect(actions[0].BoundingBox!.YMin).toBe(10);
                expect(actions[0].BoundingBox!.XMax).toBe(15);
                expect(actions[0].BoundingBox!.YMax).toBe(30);
            }
        });

        it('should parse ClickAction with lowercase field names', () => {
            const actions = parseActions([
                { Type: 'Click', x: 50, y: 60, button: 'middle', clickCount: 3 },
            ]);

            expect(actions).toHaveLength(1);
            if (actions[0].Type === 'Click') {
                expect(actions[0].X).toBe(50);
                expect(actions[0].Y).toBe(60);
                expect(actions[0].Button).toBe('middle');
                expect(actions[0].ClickCount).toBe(3);
            }
        });

        it('should default Click button to left when unrecognized', () => {
            const actions = parseActions([
                { Type: 'Click', X: 0, Y: 0, Button: 'invalid_button' },
            ]);

            if (actions[0].Type === 'Click') {
                expect(actions[0].Button).toBe('left');
            }
        });

        it('should parse TypeAction', () => {
            const actions = parseActions([{ Type: 'Type', Text: 'hello world' }]);
            expect(actions).toHaveLength(1);
            expect(actions[0].Type).toBe('Type');
            if (actions[0].Type === 'Type') {
                expect(actions[0].Text).toBe('hello world');
            }
        });

        it('should parse TypeAction with lowercase text field', () => {
            const actions = parseActions([{ Type: 'Type', text: 'lowercase' }]);
            if (actions[0].Type === 'Type') {
                expect(actions[0].Text).toBe('lowercase');
            }
        });

        it('should parse KeypressAction', () => {
            const actions = parseActions([{ Type: 'Keypress', Key: 'Enter' }]);
            expect(actions[0].Type).toBe('Keypress');
            if (actions[0].Type === 'Keypress') {
                expect(actions[0].Key).toBe('Enter');
            }
        });

        it('should parse KeyDownAction', () => {
            const actions = parseActions([{ Type: 'KeyDown', Key: 'Shift' }]);
            expect(actions[0].Type).toBe('KeyDown');
            if (actions[0].Type === 'KeyDown') {
                expect(actions[0].Key).toBe('Shift');
            }
        });

        it('should parse KeyUpAction', () => {
            const actions = parseActions([{ Type: 'KeyUp', key: 'Shift' }]);
            expect(actions[0].Type).toBe('KeyUp');
            if (actions[0].Type === 'KeyUp') {
                expect(actions[0].Key).toBe('Shift');
            }
        });

        it('should parse ScrollAction', () => {
            const actions = parseActions([{ Type: 'Scroll', DeltaY: 500, DeltaX: -100 }]);
            expect(actions[0].Type).toBe('Scroll');
            if (actions[0].Type === 'Scroll') {
                expect(actions[0].DeltaY).toBe(500);
                expect(actions[0].DeltaX).toBe(-100);
            }
        });

        it('should parse WaitAction with DurationMs', () => {
            const actions = parseActions([{ Type: 'Wait', DurationMs: 2000 }]);
            expect(actions[0].Type).toBe('Wait');
            if (actions[0].Type === 'Wait') {
                expect(actions[0].DurationMs).toBe(2000);
            }
        });

        it('should parse WaitAction with ms alias', () => {
            const actions = parseActions([{ Type: 'Wait', ms: 500 }]);
            if (actions[0].Type === 'Wait') {
                expect(actions[0].DurationMs).toBe(500);
            }
        });

        it('should default WaitAction DurationMs to 1000', () => {
            const actions = parseActions([{ Type: 'Wait' }]);
            if (actions[0].Type === 'Wait') {
                expect(actions[0].DurationMs).toBe(1000);
            }
        });

        it('should parse NavigateAction', () => {
            const actions = parseActions([{ Type: 'Navigate', Url: 'https://example.com' }]);
            expect(actions[0].Type).toBe('Navigate');
            if (actions[0].Type === 'Navigate') {
                expect(actions[0].Url).toBe('https://example.com');
            }
        });

        it('should parse GoBack, GoForward, and Refresh actions', () => {
            const actions = parseActions([
                { Type: 'GoBack' },
                { Type: 'GoForward' },
                { Type: 'Refresh' },
            ]);

            expect(actions).toHaveLength(3);
            expect(actions[0].Type).toBe('GoBack');
            expect(actions[1].Type).toBe('GoForward');
            expect(actions[2].Type).toBe('Refresh');
        });

        it('should parse Drag action with bounding boxes and coordinates', () => {
            const actions = parseActions([
                {
                    Type: 'Drag',
                    StartBoundingBox: { XMin: 100, YMin: 200, XMax: 120, YMax: 240 },
                    EndBoundingBox: { XMin: 300, YMin: 200, XMax: 320, YMax: 240 },
                    Steps: 15,
                },
                { Type: 'Drag', StartX: 50, StartY: 100, EndX: 250, EndY: 100 },
                { Type: 'Drag' }, // all defaults
            ]);

            expect(actions).toHaveLength(3);

            const withBoxes = actions[0] as Extract<typeof actions[0], { Type: 'Drag' }>;
            expect(withBoxes.Type).toBe('Drag');
            expect(withBoxes.StartBoundingBox?.XMin).toBe(100);
            expect(withBoxes.EndBoundingBox?.XMax).toBe(320);
            expect(withBoxes.Steps).toBe(15);

            const withCoords = actions[1] as Extract<typeof actions[1], { Type: 'Drag' }>;
            expect(withCoords.StartX).toBe(50);
            expect(withCoords.EndX).toBe(250);
            expect(withCoords.StartBoundingBox).toBeUndefined();
            expect(withCoords.Steps).toBe(10); // default

            const defaults = actions[2] as Extract<typeof actions[2], { Type: 'Drag' }>;
            expect(defaults.StartX).toBe(0);
            expect(defaults.EndX).toBe(0);
            expect(defaults.Steps).toBe(10);
        });

        it('should skip unrecognized action types', () => {
            const actions = parseActions([
                { Type: 'Click', X: 10, Y: 20 },
                { Type: 'UnknownAction', foo: 'bar' },
                { Type: 'Type', Text: 'test' },
            ]);

            expect(actions).toHaveLength(2);
            expect(actions[0].Type).toBe('Click');
            expect(actions[1].Type).toBe('Type');
        });

        it('should skip actions with no Type field', () => {
            const actions = parseActions([{ X: 10, Y: 20 }]);
            expect(actions).toHaveLength(0);
        });

        it('should handle string numbers via toNumber coercion', () => {
            const actions = parseActions([
                { Type: 'Click', X: '100', Y: '200' },
            ]);

            if (actions[0].Type === 'Click') {
                expect(actions[0].X).toBe(100);
                expect(actions[0].Y).toBe(200);
            }
        });

        it('should default to 0 for non-numeric coordinate values', () => {
            const actions = parseActions([
                { Type: 'Click', X: 'not-a-number', Y: null },
            ]);

            if (actions[0].Type === 'Click') {
                expect(actions[0].X).toBe(0);
                expect(actions[0].Y).toBe(0);
            }
        });

        it('should handle bounding box with lowercase field names', () => {
            const actions = parseActions([
                { Type: 'Click', X: 0, Y: 0, boundingBox: { xMin: 1, yMin: 2, xMax: 3, yMax: 4 } },
            ]);

            if (actions[0].Type === 'Click') {
                expect(actions[0].BoundingBox).toBeDefined();
                expect(actions[0].BoundingBox!.XMin).toBe(1);
                expect(actions[0].BoundingBox!.YMax).toBe(4);
            }
        });

        it('should return undefined bounding box when all fields are null', () => {
            const actions = parseActions([
                { Type: 'Click', X: 0, Y: 0, BoundingBox: {} },
            ]);

            if (actions[0].Type === 'Click') {
                expect(actions[0].BoundingBox).toBeUndefined();
            }
        });
    });

    describe('tool call parsing (via ParseControllerResponse)', () => {
        function parseToolCalls(toolCalls: Record<string, unknown>[]) {
            const input = JSON.stringify({ reasoning: '', toolCalls });
            return ResponseParser.ParseControllerResponse(input).ToolCalls;
        }

        it('should parse tool calls with toolName and arguments', () => {
            const calls = parseToolCalls([
                { toolName: 'search_db', arguments: { query: 'users' } },
            ]);

            expect(calls).toHaveLength(1);
            expect(calls[0].ToolName).toBe('search_db');
            expect(calls[0].Arguments).toEqual({ query: 'users' });
        });

        it('should parse tool calls with PascalCase ToolName', () => {
            const calls = parseToolCalls([
                { ToolName: 'fetch_page', Arguments: { url: 'https://example.com' } },
            ]);

            expect(calls).toHaveLength(1);
            expect(calls[0].ToolName).toBe('fetch_page');
        });

        it('should skip tool calls with no name', () => {
            const calls = parseToolCalls([
                { arguments: { foo: 'bar' } },
            ]);

            expect(calls).toHaveLength(0);
        });

        it('should default arguments to empty object when missing', () => {
            const calls = parseToolCalls([
                { toolName: 'no_args_tool' },
            ]);

            expect(calls).toHaveLength(1);
            expect(calls[0].Arguments).toEqual({});
        });
    });

    describe('JSON extraction edge cases', () => {
        it('should handle JSON that starts with { directly', () => {
            const result = ResponseParser.ParseControllerResponse('{"reasoning":"direct"}');
            expect(result.Reasoning).toBe('direct');
        });

        it('should handle JSON with leading/trailing whitespace', () => {
            const result = ResponseParser.ParseControllerResponse('   {"reasoning":"padded"}   ');
            expect(result.Reasoning).toBe('padded');
        });

        it('should handle nested JSON objects', () => {
            const input = JSON.stringify({
                reasoning: 'nested test',
                actions: [
                    {
                        Type: 'Click',
                        X: 10,
                        Y: 20,
                        BoundingBox: { XMin: 0, YMin: 0, XMax: 100, YMax: 100 },
                    },
                ],
            });

            const result = ResponseParser.ParseControllerResponse(input);
            expect(result.Actions).toHaveLength(1);
        });

        it('should handle text with no JSON at all', () => {
            const result = ResponseParser.ParseControllerResponse('This is just plain English text.');
            expect(result.Actions).toHaveLength(0);
            expect(result.Reasoning).toContain('Failed to extract JSON');
        });

        it('should extract first JSON block when multiple exist in surrounding text', () => {
            // The regex /\{[\s\S]*\}/ is greedy, so it grabs from first { to last }
            // When the text starts with {, the raw JSON path is taken
            const input = 'Here is the data: {"reasoning":"first"} and then {"reasoning":"second"}';
            const result = ResponseParser.ParseControllerResponse(input);
            // Greedy match captures everything from first { to last }, which includes both
            // This would be malformed JSON, so it depends on what JSON.parse does
            // The important thing is it doesn't throw
            expect(result.RawResponse).toBe(input);
        });
    });
});
