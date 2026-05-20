import { describe, it, expect } from 'vitest';
import {
    ResolveArtifactTypeByMime,
    FindArtifactTypeConflicts,
    type ArtifactTypeMatcher,
} from '../engines/artifact-mime-resolver';

const make = (overrides: Partial<ArtifactTypeMatcher> & Pick<ArtifactTypeMatcher, 'id' | 'contentType'>): ArtifactTypeMatcher => ({
    name: overrides.id,
    priority: 0,
    systemSupplied: false,
    ...overrides,
});

describe('ResolveArtifactTypeByMime', () => {
    it('returns undefined for empty / null MIME', () => {
        expect(ResolveArtifactTypeByMime([], '')).toBeUndefined();
        expect(ResolveArtifactTypeByMime([], null)).toBeUndefined();
        expect(ResolveArtifactTypeByMime([], undefined)).toBeUndefined();
    });

    it('returns undefined when no matchers match', () => {
        const matchers = [make({ id: 'A', contentType: 'application/json' })];
        expect(ResolveArtifactTypeByMime(matchers, 'application/pdf')).toBeUndefined();
    });

    it('exact match wins over wildcard at equal priority', () => {
        const matchers = [
            make({ id: 'A', contentType: 'text/*' }),
            make({ id: 'B', contentType: 'text/csv' }),
        ];
        const result = ResolveArtifactTypeByMime(matchers, 'text/csv');
        expect(result?.id).toBe('B');
    });

    it('matches subtype wildcards', () => {
        const matchers = [make({ id: 'A', contentType: 'image/*' })];
        expect(ResolveArtifactTypeByMime(matchers, 'image/png')?.id).toBe('A');
        expect(ResolveArtifactTypeByMime(matchers, 'image/jpeg')?.id).toBe('A');
        expect(ResolveArtifactTypeByMime(matchers, 'audio/mp3')).toBeUndefined();
    });

    it('higher priority wins within the same specificity bucket', () => {
        const matchers = [
            make({ id: 'A', contentType: 'image/*', priority: 0 }),
            make({ id: 'B', contentType: 'image/*', priority: 100 }),
        ];
        expect(ResolveArtifactTypeByMime(matchers, 'image/png')?.id).toBe('B');
    });

    it('user customizations beat shipped defaults at equal priority', () => {
        const matchers = [
            make({ id: 'A', contentType: 'image/*', systemSupplied: true }),
            make({ id: 'B', contentType: 'image/*', systemSupplied: false }),
        ];
        expect(ResolveArtifactTypeByMime(matchers, 'image/png')?.id).toBe('B');
    });

    it('falls back to lowest ID when priority and systemSupplied are equal', () => {
        const matchers = [
            make({ id: 'Z', contentType: 'image/*' }),
            make({ id: 'A', contentType: 'image/*' }),
        ];
        expect(ResolveArtifactTypeByMime(matchers, 'image/png')?.id).toBe('A');
    });

    it('strips MIME parameters before matching (e.g. charset)', () => {
        const matchers = [make({ id: 'A', contentType: 'application/json' })];
        expect(ResolveArtifactTypeByMime(matchers, 'application/json; charset=utf-8')?.id).toBe('A');
    });

    it('is case-insensitive', () => {
        const matchers = [make({ id: 'A', contentType: 'APPLICATION/JSON' })];
        expect(ResolveArtifactTypeByMime(matchers, 'application/json')?.id).toBe('A');
    });

    it('uses extension hint only for application/octet-stream', () => {
        const matchers = [
            make({ id: 'A', contentType: 'application/json', fileExtensions: ['json'] }),
            make({ id: 'B', contentType: 'application/octet-stream' }),
        ];
        // octet-stream + extension hint resolves to the extension-keyed type.
        expect(ResolveArtifactTypeByMime(matchers, 'application/octet-stream', 'json')?.id).toBe('A');
        // octet-stream without hint resolves to the binary catchall.
        expect(ResolveArtifactTypeByMime(matchers, 'application/octet-stream')?.id).toBe('B');
        // Other MIMEs ignore the extension hint.
        expect(ResolveArtifactTypeByMime(matchers, 'application/pdf', 'json')).toBeUndefined();
    });

    it('strips leading dots from extension hints', () => {
        const matchers = [
            make({ id: 'A', contentType: 'application/json', fileExtensions: ['json'] }),
            make({ id: 'B', contentType: 'application/octet-stream' }),
        ];
        expect(ResolveArtifactTypeByMime(matchers, 'application/octet-stream', '.json')?.id).toBe('A');
    });
});

describe('FindArtifactTypeConflicts', () => {
    it('returns no conflicts when all triples are unique', () => {
        const matchers = [
            make({ id: 'A', contentType: 'image/*', priority: 0 }),
            make({ id: 'B', contentType: 'image/*', priority: 10 }),
        ];
        expect(FindArtifactTypeConflicts(matchers)).toEqual([]);
    });

    it('reports identical (ContentType, Priority, SystemSupplied) triples', () => {
        const matchers = [
            make({ id: 'A', contentType: 'image/*', priority: 0, systemSupplied: false }),
            make({ id: 'B', contentType: 'image/*', priority: 0, systemSupplied: false }),
        ];
        const conflicts = FindArtifactTypeConflicts(matchers);
        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].matcherIds).toEqual(['A', 'B']);
    });

    it('does not conflate matchers that differ on systemSupplied', () => {
        const matchers = [
            make({ id: 'A', contentType: 'image/*', priority: 0, systemSupplied: false }),
            make({ id: 'B', contentType: 'image/*', priority: 0, systemSupplied: true }),
        ];
        expect(FindArtifactTypeConflicts(matchers)).toEqual([]);
    });
});
