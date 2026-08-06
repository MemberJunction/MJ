/**
 * Coverage for stripping a markdown code fence that WRAPS an entire agent response.
 *
 * Models fence their JSON despite being told not to, and every occurrence costs a full retry turn to
 * recover a response that was already correct. Observed with an external harness: a valid
 * `{"taskComplete": true, ...}` inside a ```json fence, rejected by JSON.parse, and the identical
 * answer returned on the retry — half that run's latency and cost bought nothing.
 *
 * The dangerous mistake here is a GLOBAL fence strip. Agent responses routinely contain fenced code
 * inside their own payload (the case that prompted this had ```haskell blocks inside `message`), so
 * stripping every fence corrupts exactly the responses this is meant to rescue. These tests pin the
 * narrow behaviour: outer wrapper only, and only when the result actually parses.
 */
import { describe, it, expect } from 'vitest';
import { LoopAgentType } from '../agent-types/loop-agent-type';

/** stripWrappingCodeFence is protected; exercise it through a minimal cast. */
function strip(raw: string): string {
    const instance = new LoopAgentType() as unknown as { stripWrappingCodeFence(r: string): string };
    return instance.stripWrappingCodeFence(raw);
}

describe('BaseAgentType.stripWrappingCodeFence', () => {
    it('unwraps a ```json fence around an entire response', () => {
        const payload = '{"taskComplete":true,"message":"done"}';
        expect(strip('```json\n' + payload + '\n```')).toBe(payload);
    });

    it('unwraps a bare ``` fence', () => {
        const payload = '{"a":1}';
        expect(strip('```\n' + payload + '\n```')).toBe(payload);
    });

    it('tolerates surrounding whitespace', () => {
        const payload = '{"a":1}';
        expect(strip('\n\n  ```json\n' + payload + '\n```  \n')).toBe(payload);
    });

    it('PRESERVES fenced code inside the payload — the case a global strip would corrupt', () => {
        // Exactly the shape observed live: the response is fenced, and its message contains its own
        // fenced code blocks. Only the outer wrapper may be removed.
        const payload = JSON.stringify({
            taskComplete: true,
            message: '# Factorial\n\n```haskell\nfact 0 = 1\n```\n\nAnd in Elixir:\n\n```elixir\ndef fact(0), do: 1\n```',
        });
        const stripped = strip('```json\n' + payload + '\n```');
        expect(stripped).toBe(payload);
        expect(JSON.parse(stripped).message).toContain('```haskell');
        expect(JSON.parse(stripped).message).toContain('```elixir');
    });

    it('leaves unfenced JSON untouched', () => {
        const payload = '{"taskComplete":true}';
        expect(strip(payload)).toBe(payload);
    });

    it('returns the ORIGINAL when the unwrapped content is not valid JSON', () => {
        // Never turn a bad response into a differently-bad one: the caller's error path should
        // report on what the model actually sent.
        const raw = '```\nI am not JSON at all\n```';
        expect(strip(raw)).toBe(raw);
    });

    it('leaves prose that merely mentions a fence alone', () => {
        const raw = 'Here is some text with ``` in the middle of it';
        expect(strip(raw)).toBe(raw);
    });

    it('does not mangle a fence-only or degenerate string', () => {
        expect(strip('```')).toBe('```');
        expect(strip('``````')).toBe('``````');
        expect(strip('')).toBe('');
    });
});
