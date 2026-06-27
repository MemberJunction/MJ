import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

// One RunView mock instance shared across the static FromMetadataProvider() the resolvers call.
const runViewMock = vi.fn();
vi.mock('@memberjunction/core', () => ({
    RunView: class {
        static FromMetadataProvider() {
            return { RunView: runViewMock };
        }
    },
    LogError: vi.fn(),
}));
// The resolvers import entity types for generics only (erased at runtime); stub the heavy module.
vi.mock('@memberjunction/core-entities', () => ({}));

import {
    mediaTypeFromMimeType,
    formatAgentMediaManifest,
    resolveAgentMediaManifest,
    resolveAgentMediaCollectionID,
    buildAgentMediaContextNote,
    type AgentMediaManifestItem,
} from '../realtime/agent-media-library';

const PROVIDER = {} as unknown as IMetadataProvider;
const USER = { ID: 'user-1' } as unknown as UserInfo;

beforeEach(() => {
    runViewMock.mockReset();
});

describe('mediaTypeFromMimeType', () => {
    it('maps each media family to its kind', () => {
        expect(mediaTypeFromMimeType('image/png')).toBe('image');
        expect(mediaTypeFromMimeType('video/mp4')).toBe('video');
        expect(mediaTypeFromMimeType('audio/mpeg')).toBe('audio');
        expect(mediaTypeFromMimeType('application/pdf')).toBe('pdf');
        expect(mediaTypeFromMimeType('text/html')).toBe('web');
    });

    it('is case- and whitespace-insensitive', () => {
        expect(mediaTypeFromMimeType('  IMAGE/PNG ')).toBe('image');
    });

    it('returns null for non-media / missing types', () => {
        expect(mediaTypeFromMimeType('text/plain')).toBeNull();
        expect(mediaTypeFromMimeType('')).toBeNull();
        expect(mediaTypeFromMimeType(null)).toBeNull();
        expect(mediaTypeFromMimeType(undefined)).toBeNull();
    });
});

describe('formatAgentMediaManifest', () => {
    it('returns null for an empty kit', () => {
        expect(formatAgentMediaManifest([])).toBeNull();
    });

    it('numbers items, includes fileId + when-to-show + PRELOAD, and does not ask to read it aloud', () => {
        const items: AgentMediaManifestItem[] = [
            { ResourceID: 'r1', FileID: 'f1', MediaType: 'image', DisplayName: 'Q3 Chart', ContextDescription: 'Show when discussing Q3', Preload: true },
            { ResourceID: 'r2', FileID: 'f2', MediaType: 'pdf', DisplayName: 'Brochure', ContextDescription: null, Preload: false },
        ];
        const note = formatAgentMediaManifest(items)!;
        expect(note).toContain('Media_ShowMedia');
        expect(note).toContain('1. "Q3 Chart" (image)');
        expect(note).toContain('Show when discussing Q3');
        expect(note).toContain('fileId: f1');
        expect(note).toContain('[PRELOAD: show at the start of the call]');
        expect(note).toContain('2. "Brochure" (pdf)');
        expect(note).toContain('fileId: f2');
        expect(note.toLowerCase()).toContain('do not read this list aloud');
    });
});

describe('resolveAgentMediaCollectionID', () => {
    it('prefers an explicit override and skips the agent lookup', async () => {
        const id = await resolveAgentMediaCollectionID(PROVIDER, USER, 'agent-1', 'override-col');
        expect(id).toBe('override-col');
        expect(runViewMock).not.toHaveBeenCalled();
    });

    it('falls back to AIAgent.DefaultMediaCollectionID', async () => {
        runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ DefaultMediaCollectionID: 'agent-col' }] });
        const id = await resolveAgentMediaCollectionID(PROVIDER, USER, 'agent-1');
        expect(id).toBe('agent-col');
    });

    it('returns null when the agent is not found', async () => {
        runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });
        expect(await resolveAgentMediaCollectionID(PROVIDER, USER, 'agent-1')).toBeNull();
    });
});

describe('resolveAgentMediaManifest', () => {
    it('orders by membership, maps fields, and falls back ContextDescription to the version description', async () => {
        runViewMock
            .mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'm1', ArtifactVersionID: 'v1', Sequence: 1, ContextDescription: 'Per-kit guidance', Preload: true },
                    { ID: 'm2', ArtifactVersionID: 'v2', Sequence: 2, ContextDescription: null, Preload: false },
                ],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'v1', FileID: 'f1', MimeType: 'image/png', Name: 'Chart', Description: 'A chart' },
                    { ID: 'v2', FileID: 'f2', MimeType: 'application/pdf', Name: 'Doc', Description: 'A doc' },
                ],
            });
        const items = await resolveAgentMediaManifest(PROVIDER, USER, 'col-1');
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({ ResourceID: 'm1', FileID: 'f1', MediaType: 'image', DisplayName: 'Chart', ContextDescription: 'Per-kit guidance', Preload: true });
        expect(items[1]).toMatchObject({ ResourceID: 'm2', FileID: 'f2', MediaType: 'pdf', ContextDescription: 'A doc', Preload: false });
    });

    it('drops memberships whose version has no FileID or a non-media MIME type', async () => {
        runViewMock
            .mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'm1', ArtifactVersionID: 'v1', Sequence: 1, ContextDescription: null, Preload: false },
                    { ID: 'm2', ArtifactVersionID: 'v2', Sequence: 2, ContextDescription: null, Preload: false },
                    { ID: 'm3', ArtifactVersionID: 'v3', Sequence: 3, ContextDescription: null, Preload: false },
                ],
            })
            .mockResolvedValueOnce({
                Success: true,
                Results: [
                    { ID: 'v1', FileID: null, MimeType: 'image/png', Name: 'NoFile', Description: '' }, // dropped: no FileID
                    { ID: 'v2', FileID: 'f2', MimeType: 'text/plain', Name: 'TextArtifact', Description: '' }, // dropped: non-media
                    { ID: 'v3', FileID: 'f3', MimeType: 'video/mp4', Name: 'Clip', Description: '' }, // kept
                ],
            });
        const items = await resolveAgentMediaManifest(PROVIDER, USER, 'col-1');
        expect(items).toHaveLength(1);
        expect(items[0]).toMatchObject({ ResourceID: 'm3', FileID: 'f3', MediaType: 'video' });
    });

    it('returns [] for an empty collection', async () => {
        runViewMock.mockResolvedValueOnce({ Success: true, Results: [] });
        expect(await resolveAgentMediaManifest(PROVIDER, USER, 'col-1')).toEqual([]);
    });
});

describe('buildAgentMediaContextNote', () => {
    it('returns null when the agent has no kit', async () => {
        runViewMock.mockResolvedValueOnce({ Success: true, Results: [{ DefaultMediaCollectionID: null }] });
        expect(await buildAgentMediaContextNote(PROVIDER, USER, 'agent-1')).toBeNull();
    });

    it('builds a note end-to-end from the agent default kit', async () => {
        runViewMock
            .mockResolvedValueOnce({ Success: true, Results: [{ DefaultMediaCollectionID: 'col-1' }] }) // agent lookup
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'm1', ArtifactVersionID: 'v1', Sequence: 1, ContextDescription: 'When relevant', Preload: false }] }) // memberships
            .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'v1', FileID: 'f1', MimeType: 'image/png', Name: 'Chart', Description: '' }] }); // versions
        const note = await buildAgentMediaContextNote(PROVIDER, USER, 'agent-1');
        expect(note).toContain('"Chart" (image)');
        expect(note).toContain('fileId: f1');
    });

    it('never throws — resolves to null on failure', async () => {
        runViewMock.mockRejectedValueOnce(new Error('db down'));
        expect(await buildAgentMediaContextNote(PROVIDER, USER, 'agent-1')).toBeNull();
    });
});
