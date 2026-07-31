import { describe, it, expect } from 'vitest';
import {
    ExtractChunkProvenance,
    HasChunkProvenance,
    ResolveHitID,
    ResolveHitSnippet,
    ResolveHitTitle,
} from '../generic/ExternalHitMapper';

describe('ResolveHitSnippet', () => {
    it('prefers a conventional content field', () => {
        expect(ResolveHitSnippet({ content: 'body text', description: 'desc' })).toBe('body text');
    });

    it('falls back to description when there is no body', () => {
        expect(ResolveHitSnippet({ description: 'an AI-written summary' })).toBe('an AI-written summary');
    });

    it('falls back to transcript for media chunks', () => {
        // A media chunk has no body text of its own — the transcript is what makes it
        // findable and readable.
        expect(ResolveHitSnippet({ transcript: 'Host: welcome everyone.' })).toBe('Host: welcome everyone.');
    });

    it('honours an explicitly configured field first', () => {
        expect(ResolveHitSnippet({ custom: 'from config', content: 'ignored' }, 'custom')).toBe('from config');
    });

    it('skips empty values rather than returning blank', () => {
        expect(ResolveHitSnippet({ content: '   ', description: 'real' })).toBe('real');
    });

    it('returns an empty string when nothing matches', () => {
        expect(ResolveHitSnippet({ irrelevant: 1 })).toBe('');
    });
});

describe('ResolveHitTitle', () => {
    it('prefers title, then name', () => {
        expect(ResolveHitTitle({ title: 'T', name: 'N' }, 'fb')).toBe('T');
        expect(ResolveHitTitle({ name: 'N' }, 'fb')).toBe('N');
    });

    it('recognizes a chunk segment title', () => {
        expect(ResolveHitTitle({ segmentTitle: 'Chapter 3' }, 'fb')).toBe('Chapter 3');
    });

    it('falls back when no title-ish field is present', () => {
        expect(ResolveHitTitle({}, 'the-id')).toBe('the-id');
    });
});

describe('ResolveHitID', () => {
    it('accepts common id casings', () => {
        expect(ResolveHitID({ ID: 'abc' }, 'fb')).toBe('abc');
        expect(ResolveHitID({ recordId: 'xyz' }, 'fb')).toBe('xyz');
    });

    it('falls back when absent', () => {
        expect(ResolveHitID({}, 'fallback')).toBe('fallback');
    });
});

describe('ExtractChunkProvenance', () => {
    it('extracts chunk identity and a time window', () => {
        const provenance = ExtractChunkProvenance({
            chunkId: 'chunk-1',
            contentItemId: 'item-9',
            modality: 'video',
            startMs: 862000,
            endMs: 905000,
        });
        expect(provenance).toEqual({
            ChunkID: 'chunk-1',
            ContentItemID: 'item-9',
            Modality: 'video',
            StartMs: 862000,
            EndMs: 905000,
        });
    });

    it('accepts snake_case and PascalCase field names', () => {
        expect(ExtractChunkProvenance({ chunk_id: 'c', page_number: 14 })).toEqual({ ChunkID: 'c', PageNumber: 14 });
        expect(ExtractChunkProvenance({ ChunkID: 'c', PageNumber: 3 })).toEqual({ ChunkID: 'c', PageNumber: 3 });
    });

    it('coerces numeric strings, since indexes often store numbers as text', () => {
        expect(ExtractChunkProvenance({ startMs: '1500' }).StartMs).toBe(1500);
    });

    it('ignores non-numeric junk rather than emitting NaN', () => {
        expect(ExtractChunkProvenance({ startMs: 'soon' }).StartMs).toBeUndefined();
    });

    it('returns an empty object for a plain document', () => {
        const provenance = ExtractChunkProvenance({ title: 'x', content: 'y' });
        expect(provenance).toEqual({});
        expect(HasChunkProvenance(provenance)).toBe(false);
    });

    it('reports when provenance is present', () => {
        expect(HasChunkProvenance(ExtractChunkProvenance({ pageNumber: 2 }))).toBe(true);
    });
});
