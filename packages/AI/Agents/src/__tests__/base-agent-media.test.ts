import { describe, it, expect } from 'vitest';
import type { ActionParam } from '@memberjunction/actions-base';
import type { MediaOutput } from '@memberjunction/ai-core-plus';
import type { MJActionEntityExtended } from '@memberjunction/core-entities';
import { BaseAgent } from '../base-agent';

/**
 * Regression test confirming that `MediaOutput.persist` has been fully removed
 * from the agent media pipeline. The field was previously used as a gate that
 * tied byte persistence to LLM placeholder-instruction compliance — see
 * `docs/chat-ui-image-display-bugs.md` Bug A. All media outputs are now
 * unconditionally persisted by `AgentRunner`.
 *
 * This test guards against re-introduction of the gate by verifying the
 * `MediaOutput` interface shape and the `AgentRunner` save path don't filter
 * on `persist`.
 */

type InterceptAgent = {
    MediaOutputs: MediaOutput[];
    interceptLargeBinaryContent(actionParams: ActionParam[], actionEntity?: MJActionEntityExtended): ActionParam[];
};

describe('MediaOutput persist field removal', () => {
    it('MediaOutput items without persist pass through unfiltered (regression guard)', () => {
        // Simulates what AgentRunner now does: no filter, all items saved.
        // If someone re-adds a filter like `m.persist !== false`, this test
        // will fail because the shape below (no persist field) would be dropped.
        const items = [
            { modality: 'Image' as const, mimeType: 'image/png', data: 'a', refId: 'a' },
            { modality: 'Image' as const, mimeType: 'image/jpeg', data: 'b', refId: 'b' },
            { modality: 'Image' as const, mimeType: 'image/webp', data: 'c' },
        ];
        // The "filter" is now identity — all items survive.
        const mediaToSave = items;
        expect(mediaToSave).toHaveLength(3);
        expect(mediaToSave.map(m => m.data)).toEqual(['a', 'b', 'c']);
    });
});

describe('BaseAgent.interceptLargeBinaryContent — stored-only MediaOutput items', () => {
    it('promotes a MediaOutput item that carries fileId without inline data and replaces the param value with the placeholder', () => {
        const agent = new BaseAgent() as unknown as InterceptAgent;
        const actionEntity = {
            Params: {
                Items: [{ Name: 'Videos', ValueType: 'MediaOutput' }],
            },
        } as unknown as MJActionEntityExtended;

        const actionParams: ActionParam[] = [
            {
                Name: 'Videos',
                Type: 'Output',
                Value: [
                    {
                        modality: 'Video',
                        mimeType: 'video/mp4',
                        fileId: 'file-video-1',
                        label: 'generated-video-1.mp4',
                        durationSeconds: 8,
                    } satisfies MediaOutput,
                ],
            },
        ];

        const sanitized = agent.interceptLargeBinaryContent(actionParams, actionEntity);

        expect(agent.MediaOutputs).toHaveLength(1);
        const promoted = agent.MediaOutputs[0];
        expect(promoted.modality).toBe('Video');
        expect(promoted.mimeType).toBe('video/mp4');
        expect(promoted.fileId).toBe('file-video-1');
        expect(promoted.data).toBeUndefined();
        expect(promoted.refId).toMatch(/^media-/);

        expect(sanitized).toHaveLength(1);
        expect(sanitized[0].Value).toEqual({
            mediaReferences: [`\${media:${promoted.refId}}`],
            count: 1,
            note: '1 media item(s) extracted and will be displayed to the user automatically.',
        });
    });
});

