import { describe, it, expect } from 'vitest';
import { GetToolUseFailedGeneration, ParseFailedGeneration } from '../models/failedGeneration';

describe('ParseFailedGeneration', () => {
    it('reads the Qwen function/parameter form, parsing JSON values and keeping text values', () => {
        const text = [
            '<tool_call>',
            '<function=create_svg_chart>',
            '<parameter=ChartType>',
            'bar',
            '</parameter>',
            '<parameter=Data>',
            '[{"label":"A","value":3},{"label":"B","value":5}]',
            '</parameter>',
            '<parameter=ShowGrid>',
            'true',
            '</parameter>',
            '<parameter=Width>',
            '800',
            '</parameter>',
            '</function>',
            '</tool_call>'
        ].join('\n');

        expect(ParseFailedGeneration(text)).toEqual([{
            Name: 'create_svg_chart',
            Arguments: {
                ChartType: 'bar',
                Data: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }],
                ShowGrid: 'true',
                Width: '800'
            }
        }]);
    });

    it('reads several Qwen calls and a call whose closing tags were cut off', () => {
        const text = '<function=a><parameter=x>1</parameter></function><function=b><parameter=y>\nhello';

        expect(ParseFailedGeneration(text)).toEqual([
            { Name: 'a', Arguments: { x: '1' } },
            { Name: 'b', Arguments: { y: 'hello' } }
        ]);
    });

    it('reads the JSON form with object or string arguments', () => {
        expect(ParseFailedGeneration('{"name": "create_svg_chart", "arguments": {"ShowGrid": "true"}}'))
            .toEqual([{ Name: 'create_svg_chart', Arguments: { ShowGrid: 'true' } }]);
        expect(ParseFailedGeneration('{"name": "create_svg_chart", "arguments": "{\\"Width\\": \\"800\\"}"}'))
            .toEqual([{ Name: 'create_svg_chart', Arguments: { Width: '800' } }]);
    });

    it('reads a fenced JSON list and the OpenAI function wrapper', () => {
        const text = '```json\n[{"type": "function", "function": {"name": "a", "arguments": {"x": 1}}}, {"name": "b"}]\n```';

        expect(ParseFailedGeneration(text)).toEqual([
            { Name: 'a', Arguments: { x: 1 } },
            { Name: 'b', Arguments: {} }
        ]);
    });

    it('returns the undeclared name as written; the driver decides whether to recover', () => {
        expect(ParseFailedGeneration('{"name": "LoopAgentResponse", "arguments": {}}'))
            .toEqual([{ Name: 'LoopAgentResponse', Arguments: {} }]);
    });

    it('returns no calls for garbage, empty text, a nameless call or non-object arguments', () => {
        expect(ParseFailedGeneration('I cannot call that tool.')).toEqual([]);
        expect(ParseFailedGeneration('')).toEqual([]);
        expect(ParseFailedGeneration(undefined)).toEqual([]);
        expect(ParseFailedGeneration('{"arguments": {"x": 1}}')).toEqual([]);
        expect(ParseFailedGeneration('{"name": "a", "arguments": "not json"}')).toEqual([]);
        expect(ParseFailedGeneration('{"name": "a", "arguments": [1, 2]}')).toEqual([]);
        expect(ParseFailedGeneration('{"name": "a"')).toEqual([]);
    });
});

describe('GetToolUseFailedGeneration', () => {
    const sdkError = (status: number, body: unknown): Error => Object.assign(new Error('x'), { status, error: body });

    it('reads failed_generation from the nested SDK body and from an inner body', () => {
        expect(GetToolUseFailedGeneration(sdkError(400, { error: { code: 'tool_use_failed', failed_generation: 'gen' } }))).toBe('gen');
        expect(GetToolUseFailedGeneration(sdkError(400, { code: 'tool_use_failed', failed_generation: 'gen' }))).toBe('gen');
    });

    it('returns undefined for other statuses, codes, missing generations and non-SDK errors', () => {
        expect(GetToolUseFailedGeneration(sdkError(429, { error: { code: 'tool_use_failed', failed_generation: 'gen' } }))).toBeUndefined();
        expect(GetToolUseFailedGeneration(sdkError(400, { error: { code: 'invalid_request', failed_generation: 'gen' } }))).toBeUndefined();
        expect(GetToolUseFailedGeneration(sdkError(400, { error: { code: 'tool_use_failed' } }))).toBeUndefined();
        expect(GetToolUseFailedGeneration(new Error('boom'))).toBeUndefined();
        expect(GetToolUseFailedGeneration(null)).toBeUndefined();
        expect(GetToolUseFailedGeneration('400')).toBeUndefined();
    });
});
