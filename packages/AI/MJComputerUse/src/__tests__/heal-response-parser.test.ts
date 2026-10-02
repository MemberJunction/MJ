import { describe, it, expect } from 'vitest';
import { MJComputerUseEngine } from '../engine/MJComputerUseEngine';

// The LLM heal call itself is live-gated (deferred to tier dispatch), but
// its response parser is pure + static, so it is fully unit-testable here. It is
// the one piece of the heal seam whose correctness does not depend on a live model.
const parse = MJComputerUseEngine.parseHealResponse;

describe('MJComputerUseEngine.parseHealResponse', () => {
    it('parses a plain {index, confidence} object', () => {
        expect(parse('{"index":2,"confidence":0.86}')).toEqual({ index: 2, confidence: 0.86 });
    });

    it('tolerates a ```json fenced block', () => {
        expect(parse('```json\n{"index":0,"confidence":0.9}\n```')).toEqual({ index: 0, confidence: 0.9 });
    });

    it('tolerates a bare ``` fence and surrounding whitespace', () => {
        expect(parse('  ```\n{"index":3,"confidence":0.5}\n```  ')).toEqual({ index: 3, confidence: 0.5 });
    });

    it('clamps confidence into [0, 1]', () => {
        expect(parse('{"index":1,"confidence":1.5}').confidence).toBe(1);
        expect(parse('{"index":1,"confidence":-0.2}').confidence).toBe(0);
    });

    it('declines (confidence 0) when no index is named', () => {
        expect(parse('{"confidence":0.99}')).toEqual({ confidence: 0 });
    });

    it('declines on a non-integer or negative index', () => {
        expect(parse('{"index":2.5,"confidence":0.9}')).toEqual({ confidence: 0 });
        expect(parse('{"index":-1,"confidence":0.9}')).toEqual({ confidence: 0 });
    });

    it('treats a present index with non-numeric confidence as confidence 0', () => {
        expect(parse('{"index":4,"confidence":"high"}')).toEqual({ index: 4, confidence: 0 });
    });

    it('declines on malformed / empty input rather than throwing', () => {
        expect(parse('not json')).toEqual({ confidence: 0 });
        expect(parse('')).toEqual({ confidence: 0 });
        expect(parse('{"index":')).toEqual({ confidence: 0 });
    });

    it('accepts index 0 (a valid element position)', () => {
        expect(parse('{"index":0,"confidence":0.7}')).toEqual({ index: 0, confidence: 0.7 });
    });
});
