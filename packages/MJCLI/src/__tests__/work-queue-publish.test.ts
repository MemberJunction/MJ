import { describe, expect, it } from 'vitest';
import { BuildPublishRequests, FormatPublishResults, ParseAttributes, ParsePayload } from '../commands/queue/publish.js';

describe('mj queue publish helpers', () => {
    it('parses key=value attributes, splitting on the first =', () => {
        expect(ParseAttributes(['source=demo', 'note=a=b'])).toEqual({ source: 'demo', note: 'a=b' });
        expect(ParseAttributes(undefined)).toEqual({});
        expect(() => ParseAttributes(['novalue'])).toThrow("--attribute expects key=value, got 'novalue'");
        expect(() => ParseAttributes(['=x'])).toThrow('--attribute expects key=value');
    });

    it('parses the payload as JSON and names the problem when it is not', () => {
        expect(ParsePayload('{"name":"Paul"}')).toEqual({ name: 'Paul' });
        expect(ParsePayload('"text"')).toBe('text');
        expect(() => ParsePayload('{name}')).toThrow('--payload is not valid JSON');
    });

    it('builds one request per copy, numbering copies and applying the dedup key to the first only', () => {
        const single = BuildPublishRequests({ payload: { n: 1 }, attributes: { source: 'demo' }, count: 1, partitionKey: 'k1', dedupKey: 'once' });
        expect(single).toEqual([{ Payload: { n: 1 }, Attributes: { source: 'demo' }, PartitionKey: 'k1', DeduplicationKey: 'once' }]);

        const batch = BuildPublishRequests({ payload: {}, attributes: {}, count: 3, dedupKey: 'once' });
        expect(batch.map(r => r.Attributes)).toEqual([{ sequence: '1' }, { sequence: '2' }, { sequence: '3' }]);
        expect(batch.map(r => r.DeduplicationKey)).toEqual(['once', undefined, undefined]);
        expect(batch.every(r => r.PartitionKey === undefined)).toBe(true);
    });

    it('formats results as a table with the error code and message', () => {
        const text = FormatPublishResults([
            { MessageID: 'A', Status: 'Accepted' },
            { MessageID: 'B', Status: 'Rejected', Error: { Code: 'PayloadTooLarge', Message: 'too big', Retryable: false } },
        ]);
        expect(text).toContain('Accepted');
        expect(text).toContain('PayloadTooLarge: too big');
    });
});
