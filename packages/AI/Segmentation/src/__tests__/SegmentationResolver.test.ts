import { describe, it, expect } from 'vitest';
import { LoadContentSegmenters } from '../index';
import { BaseSegmenter } from '../generic/BaseSegmenter';
import { ResolveSegmenter, SuggestSegmenterKey } from '../generic/SegmentationResolver';

describe('segmenter registration', () => {
    it('exposes a load-prevention export so bundlers retain the registrations', () => {
        // If this is ever tree-shaken away, Resolve() returns null and callers silently
        // fall back to the wrong strategy rather than failing.
        expect(typeof LoadContentSegmenters).toBe('function');
        expect(() => LoadContentSegmenters()).not.toThrow();
    });

    it('resolves every built-in segmenter through the class factory', () => {
        LoadContentSegmenters();
        for (const key of ['StructuralText', 'Transcript', 'FixedWindow', 'SemanticText']) {
            const instance = BaseSegmenter.Resolve(key);
            expect(instance, `expected '${key}' to be registered`).not.toBeNull();
            expect(instance?.Key).toBe(key);
        }
    });
});

describe('ResolveSegmenter', () => {
    it('returns the requested segmenter when registered', () => {
        expect(ResolveSegmenter('StructuralText').Key).toBe('StructuralText');
    });

    it('falls back rather than throwing when a configured key is unknown', () => {
        const resolved = ResolveSegmenter('NoSuchSegmenter');
        expect(resolved).toBeInstanceOf(BaseSegmenter);
        expect(resolved.Key).toBe('FixedWindow');
    });

    it('uses the supplied fallback key before the built-in default', () => {
        expect(ResolveSegmenter('NoSuchSegmenter', 'StructuralText').Key).toBe('StructuralText');
    });

    it('falls back when no key is supplied at all', () => {
        expect(ResolveSegmenter(undefined, 'Transcript').Key).toBe('Transcript');
    });
});

describe('SuggestSegmenterKey', () => {
    it('prefers the transcript segmenter when cues are present', () => {
        const key = SuggestSegmenterKey({
            Cues: [{ StartMs: 0, EndMs: 1, Text: 'hi' }],
            Text: 'also has text',
        });
        expect(key).toBe('Transcript');
    });

    it('prefers structural segmentation for text', () => {
        expect(SuggestSegmenterKey({ Text: 'some document text' })).toBe('StructuralText');
    });

    it('falls back to fixed windows for bare media', () => {
        expect(SuggestSegmenterKey({ Media: { URL: 'a.mp4' } })).toBe('FixedWindow');
    });
});
