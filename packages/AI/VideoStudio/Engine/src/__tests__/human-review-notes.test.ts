import { describe, expect, it } from 'vitest';
import type { VideoGenerationSpec } from '@memberjunction/video-studio-core';
import { ComposeHumanReviewNotes } from '../review/human-review-notes.js';

describe('ComposeHumanReviewNotes', () => {
    it('omits the Storage section when all Output.Videos entries are stored in MJStorage by FileID', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Output: {
                Videos: {
                    '16:9': {
                        Format: '16:9',
                        FileID: '11111111-1111-4111-8111-111111111111',
                        MimeType: 'video/mp4',
                        Width: 1920,
                        Height: 1080,
                        DurationSeconds: 15,
                        FileSizeBytes: 5_242_880,
                    },
                },
                ContactSheetFileIDs: {},
                RenderMetadata: {
                    Renderer: 'HyperFrames',
                    RendererVersion: '0.8.134',
                    Seed: 1,
                    Fps: 30,
                    DurationByFormat: { '16:9': 15 },
                    RenderedAt: '2026-10-17T00:00:00.000Z',
                },
            },
        };

        const notes = ComposeHumanReviewNotes(spec);
        expect(notes).toContain('No open defects.');
        expect(notes).not.toContain('Storage');
        expect(notes).not.toContain('Stored inline in the database');
    });

    it('includes the Storage section when any Output.Videos entry has InlineBase64', () => {
        const spec: Partial<VideoGenerationSpec> = {
            Output: {
                Videos: {
                    '16:9': {
                        Format: '16:9',
                        InlineBase64: Buffer.from('inline-video-bytes').toString('base64'),
                        MimeType: 'video/mp4',
                        Width: 1920,
                        Height: 1080,
                        DurationSeconds: 15,
                        FileSizeBytes: Math.round(1.4 * 1024 * 1024),
                    },
                },
                ContactSheetFileIDs: {},
                RenderMetadata: {
                    Renderer: 'HyperFrames',
                    RendererVersion: '0.8.134',
                    Seed: 1,
                    Fps: 30,
                    DurationByFormat: { '16:9': 15 },
                    RenderedAt: '2026-10-17T00:00:00.000Z',
                },
            },
        };

        const notes = ComposeHumanReviewNotes(spec);
        expect(notes).toContain(
            'Storage\nStored inline in the database, not in file storage: 16:9 (1.4 MB). Set up file storage before sharing this production.',
        );
    });
});
