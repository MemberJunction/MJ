import { describe, it, expect } from 'vitest';
import { LegacyQueueTopicName, LegacyQueueTypeSlug } from '../LegacyQueueTopicName';
import {
    BuildLegacyQueueTaskPayload, IsLegacyQueueTaskPayload, ToTaskOptions, ToWorkJson,
} from '../LegacyQueueTaskPayload';

describe('LegacyQueueTopicName', () => {
    it('slugs the shipped queue type names', () => {
        expect(LegacyQueueTopicName('Entity AI Action')).toBe('mjqueue.entity-ai-action');
        expect(LegacyQueueTopicName('AI Action')).toBe('mjqueue.ai-action');
    });

    it('trims, lower-cases and collapses non-alphanumeric runs', () => {
        expect(LegacyQueueTypeSlug('  AI  Action!! ')).toBe('ai-action');
        expect(LegacyQueueTopicName('mj-it-routed-type (mj-it)')).toBe('mjqueue.mj-it-routed-type-mj-it');
    });

    it('maps names that differ only in punctuation to one topic', () => {
        expect(LegacyQueueTopicName('AI-Action')).toBe(LegacyQueueTopicName('AI Action'));
    });

    it('rejects a name with no letters or digits', () => {
        expect(() => LegacyQueueTypeSlug('***')).toThrow("Queue type name '***' has no letters or digits");
        expect(() => LegacyQueueTopicName('   ')).toThrow('has no letters or digits');
    });
});

describe('ToWorkJson', () => {
    it('keeps plain JSON values', () => {
        const value = { a: 'x', b: 2, c: true, d: null, e: [1, { f: 'g' }] };
        expect(ToWorkJson(value)).toEqual(value);
    });

    it('drops undefined object properties', () => {
        expect(ToWorkJson({ a: 1, b: undefined })).toEqual({ a: 1 });
    });

    it('rejects class instances, dates and non-finite numbers', () => {
        class Record { ID = '1'; }
        expect(ToWorkJson(new Record())).toBeUndefined();
        expect(ToWorkJson({ at: new Date() })).toBeUndefined();
        expect(ToWorkJson({ n: Number.NaN })).toBeUndefined();
    });

    it('rejects cycles but accepts shared references', () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(ToWorkJson(cyclic)).toBeUndefined();
        const shared = { v: 1 };
        expect(ToWorkJson({ a: shared, b: shared })).toEqual({ a: { v: 1 }, b: { v: 1 } });
    });
});

describe('BuildLegacyQueueTaskPayload', () => {
    it('wraps JSON data and options, mapping undefined to null, and carries the enqueuing user', () => {
        expect(BuildLegacyQueueTaskPayload('AI Action', { actionId: 'a' }, undefined, 'user-1'))
            .toEqual({ queueTypeName: 'AI Action', data: { actionId: 'a' }, options: null, userID: 'user-1' });
    });

    it('returns null when data is not plain JSON', () => {
        class Live { Save() { return true; } }
        expect(BuildLegacyQueueTaskPayload('Entity AI Action', { entityRecord: new Live() }, null, 'user-1')).toBeNull();
    });
});

describe('IsLegacyQueueTaskPayload and ToTaskOptions', () => {
    it('recognises payloads read back from JSON', () => {
        const payload = BuildLegacyQueueTaskPayload('AI Action', { x: 1 }, { priority: 3 }, null);
        expect(IsLegacyQueueTaskPayload(JSON.parse(JSON.stringify(payload)))).toBe(true);
        expect(IsLegacyQueueTaskPayload({ data: {} })).toBe(false);
        expect(IsLegacyQueueTaskPayload('AI Action')).toBe(false);
    });

    it('rejects a userID that is neither a string nor null', () => {
        expect(IsLegacyQueueTaskPayload({ queueTypeName: 'AI Action', data: {}, options: null, userID: 7 })).toBe(false);
    });

    it('keeps only a numeric priority', () => {
        expect(ToTaskOptions({ priority: 3, other: 'x' })).toEqual({ priority: 3 });
        expect(ToTaskOptions({ priority: 'high' })).toEqual({});
        expect(ToTaskOptions(null)).toEqual({});
    });
});
