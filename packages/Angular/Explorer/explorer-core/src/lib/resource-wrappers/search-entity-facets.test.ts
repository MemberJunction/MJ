import { describe, it, expect } from 'vitest';
import type { SearchResultItem } from '@memberjunction/ng-search';
import { MergeSearchResults, SearchResultKey, ServerEntityNames, STORAGE_FILES_FACET_VALUE } from './search-entity-facets';

function result(entityName: string, recordID: string, id = `${entityName}-${recordID}`, score = 0.5): SearchResultItem {
    return {
        ID: id,
        Title: recordID,
        Snippet: '',
        EntityName: entityName,
        RecordID: recordID,
        SourceType: 'entity',
        Score: score,
        ScoreBreakdown: {},
        Tags: [],
        SourceIcon: '',
        MatchedAt: new Date(0),
    };
}

describe('ServerEntityNames', () => {
    it('returns the selected Entity facet values, sorted', () => {
        expect(ServerEntityNames({ Entity: ['Members', 'Content Items'] })).toEqual(['Content Items', 'Members']);
    });

    it('leaves out the client-only Files option', () => {
        expect(ServerEntityNames({ Entity: [STORAGE_FILES_FACET_VALUE, 'Content Items'] })).toEqual(['Content Items']);
        expect(ServerEntityNames({ Entity: [STORAGE_FILES_FACET_VALUE] })).toEqual([]);
    });

    it('ignores the other facet categories', () => {
        expect(ServerEntityNames({ Source: ['vector'], Tags: ['food'] })).toEqual([]);
    });

    it('does not reorder the caller\'s array', () => {
        const selected = ['Members', 'Content Items'];
        ServerEntityNames({ Entity: selected });
        expect(selected).toEqual(['Members', 'Content Items']);
    });
});

describe('SearchResultKey', () => {
    it('identifies a result by entity and record key, not by result ID', () => {
        expect(SearchResultKey(result('Members', '1', 'vector-1'))).toBe(SearchResultKey(result('Members', '1', 'fulltext-9')));
        expect(SearchResultKey(result('Members', '1'))).not.toBe(SearchResultKey(result('Events', '1')));
    });

    it('falls back to the result ID when there is no record key', () => {
        expect(SearchResultKey(result('', '', 'file-a'))).not.toBe(SearchResultKey(result('', '', 'file-b')));
    });
});

describe('MergeSearchResults', () => {
    it('keeps the existing results in place and appends the new ones in incoming order', () => {
        const existing = [result('Members', '1'), result('Content Items', '1')];
        const incoming = [result('Content Items', '2'), result('Content Items', '3')];

        const merged = MergeSearchResults(existing, incoming);

        expect(merged.map(SearchResultKey)).toEqual([...existing, ...incoming].map(SearchResultKey));
    });

    it('skips duplicates, keeping the copy already loaded (and its score)', () => {
        const original = result('Content Items', '1', 'broad-1', 0.2);
        const merged = MergeSearchResults([original], [result('Content Items', '1', 'filtered-1', 1), result('Content Items', '2')]);

        expect(merged).toHaveLength(2);
        expect(merged[0]).toBe(original);
        expect(merged[1].RecordID).toBe('2');
    });

    it('skips duplicates within the incoming batch', () => {
        const merged = MergeSearchResults([], [result('Events', '1', 'a'), result('Events', '1', 'b')]);
        expect(merged.map(r => r.ID)).toEqual(['a']);
    });

    it('returns the existing array when nothing is new', () => {
        const existing = [result('Members', '1')];
        expect(MergeSearchResults(existing, [result('Members', '1', 'other')])).toBe(existing);
    });
});
