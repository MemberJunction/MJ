/**
 * Model-written JSON must not reach Object.prototype.
 *
 * `JSON.parse` keeps `"__proto__"` as an own key. Before this guard, a payloadChangeRequest such as
 * `{"updateElements":{"__proto__":{"polluted":"yes"}}}` made PayloadManager walk into
 * Object.prototype and set `polluted` on every object in the process.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { AgentPayloadChangeRequest, AIPromptRunResult, ExecuteAgentParams } from '@memberjunction/ai-core-plus';
import { PayloadManager } from '../PayloadManager';
import { LoopAgentType } from '../agent-types/loop-agent-type';
import { IsUnsafeObjectKey, StripUnsafeObjectKeys } from '../unsafe-object-keys';

vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    LogStatusEx: vi.fn(),
    IsVerboseLoggingEnabled: vi.fn(() => false),
}));

type PrototypeProbe = { polluted?: string };

function isPolluted(): boolean {
    return (({}) as PrototypeProbe).polluted !== undefined;
}

function parseChangeRequest(json: string): AgentPayloadChangeRequest<Record<string, unknown>> {
    return JSON.parse(json) as AgentPayloadChangeRequest<Record<string, unknown>>;
}

afterEach(() => {
    // Keep one failing test from leaking into the rest of the run.
    delete (Object.prototype as PrototypeProbe).polluted;
});

describe('StripUnsafeObjectKeys', () => {
    it('flags __proto__, constructor and prototype only', () => {
        expect(['__proto__', 'constructor', 'prototype'].every(IsUnsafeObjectKey)).toBe(true);
        expect(IsUnsafeObjectKey('proto')).toBe(false);
        expect(IsUnsafeObjectKey('Constructor')).toBe(false);
    });

    it('removes unsafe keys at every depth, including inside arrays, and reports their paths', () => {
        const value = JSON.parse('{"a":{"__proto__":{"x":1},"keep":2},"list":[{"constructor":{"prototype":{}}}]}');

        const removed = StripUnsafeObjectKeys(value);

        expect(removed).toEqual(['a.__proto__', 'list.0.constructor']);
        expect(value).toEqual({ a: { keep: 2 }, list: [{}] });
    });

    it('returns an empty list for primitives and clean objects', () => {
        expect(StripUnsafeObjectKeys('text')).toEqual([]);
        expect(StripUnsafeObjectKeys(null)).toEqual([]);
        expect(StripUnsafeObjectKeys({ a: [1, { b: 2 }] })).toEqual([]);
    });
});

describe('PayloadManager with unsafe keys', () => {
    it('does not write to Object.prototype through updateElements.__proto__', () => {
        const pm = new PayloadManager();
        const result = pm.ApplyAgentChangeRequest({ a: 1 }, parseChangeRequest('{"updateElements":{"__proto__":{"polluted":"yes"}}}'));

        expect(isPolluted()).toBe(false);
        expect(result.result).toEqual({ a: 1 });
        expect(result.warnings).toContain(`Ignored unsafe key 'updateElements.__proto__' in payloadChangeRequest`);
    });

    it('does not write to Object.prototype through a nested newElements path', () => {
        const pm = new PayloadManager();
        const request = parseChangeRequest('{"newElements":{"settings":{"__proto__":{"polluted":"yes"}},"title":"t"}}');

        const result = pm.ApplyAgentChangeRequest({ settings: { theme: 'dark' } }, request);

        expect(isPolluted()).toBe(false);
        expect(result.result).toEqual({ settings: { theme: 'dark' }, title: 't' });
    });

    it('does not reach the constructor prototype through constructor.prototype', () => {
        const pm = new PayloadManager();
        pm.ApplyAgentChangeRequest({ a: 1 }, parseChangeRequest('{"updateElements":{"constructor":{"prototype":{"polluted":"yes"}}}}'));

        expect(isPolluted()).toBe(false);
    });

    it('DeepMerge skips an own __proto__ key in the source', () => {
        const pm = new PayloadManager();
        const merged = pm.DeepMerge<Record<string, unknown>>({ a: 1 }, JSON.parse('{"__proto__":{"polluted":"yes"},"b":2}'));

        expect(isPolluted()).toBe(false);
        expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
        expect(merged).toEqual({ a: 1, b: 2 });
    });

    it('DeepMerge does not copy an own __proto__ key from the destination onto the result prototype', () => {
        const pm = new PayloadManager();
        const merged = pm.DeepMerge<Record<string, unknown>>(JSON.parse('{"__proto__":{"polluted":"yes"},"a":1}'), { b: 2 });

        expect(Object.getPrototypeOf(merged)).toBe(Object.prototype);
        expect((merged as PrototypeProbe).polluted).toBeUndefined();
    });
});

describe('LoopAgentType response parsing with unsafe keys', () => {
    it('drops __proto__ from the parsed response before it is used', async () => {
        const agent = new LoopAgentType();
        const promptResult: AIPromptRunResult = {
            success: true,
            result: '{"taskComplete":true,"message":"done","payloadChangeRequest":{"updateElements":{"__proto__":{"polluted":"yes"}}}}',
            chatResult: {} as AIPromptRunResult['chatResult'],
        };

        const step = await agent.DetermineNextStep(promptResult, {} as ExecuteAgentParams, {}, {});

        expect(step.step).toBe('Success');
        expect(Object.keys(step.payloadChangeRequest?.updateElements ?? {})).not.toContain('__proto__');
        expect(isPolluted()).toBe(false);
    });
});
