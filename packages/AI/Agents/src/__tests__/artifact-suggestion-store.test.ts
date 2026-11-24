/**
 * Artifact suggestion fallback store lifecycle tests: active keys are never dropped under an
 * arbitrary count cap, standalone ephemeral edits replace the superseded content-hash key on
 * accept, and abandoned keys expire cleanly after `STORED_SUGGESTIONS_TTL_MS`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    ClearStoredArtifactSuggestions,
    ComputeArtifactSuggestionStoreKey,
    ExecuteListSuggestionsTool,
    ExecuteProposeSuggestionTool,
    ExecuteReviewSuggestionTool,
    GetStoredArtifactSuggestionKeyCount,
    GetStoredArtifactSuggestions,
    SetStoredArtifactSuggestions,
    STORED_SUGGESTIONS_TTL_MS,
    type ArtifactSuggestionRecord,
} from '../artifact-tools/artifact-comment-suggestion-helper';

function suggestion(id: string): ArtifactSuggestionRecord {
    return {
        SuggestionID: id,
        Domain: 'document',
        Anchor: { quote: 'hello' },
        OriginalSlice: 'hello',
        ProposedReplacement: 'hi',
        Rationale: 'shorter',
        AuthorName: 'Agent',
        CreatedAt: new Date(0).toISOString(),
        Status: 'Pending',
    };
}

async function propose(content: string): Promise<string> {
    const result = await ExecuteProposeSuggestionTool({
        domain: 'document',
        artifactContent: content,
        input: { anchor: { quote: 'hello' }, originalSlice: 'hello', proposedReplacement: 'hi', rationale: 'shorter' },
        validateTarget: () => ({ ok: true }),
    });
    expect(result.success).toBe(true);
    return (result.data as { suggestionId: string }).suggestionId;
}

describe('artifact suggestion store', () => {
    beforeEach(() => {
        ClearStoredArtifactSuggestions();
    });

    afterEach(() => {
        ClearStoredArtifactSuggestions();
        vi.useRealTimers();
    });

    it('returns what was stored, as a copy the caller cannot use to mutate the store', () => {
        SetStoredArtifactSuggestions('artifact:a', [suggestion('s1')]);

        const read = GetStoredArtifactSuggestions('artifact:a');
        expect(read).toHaveLength(1);
        read[0].Status = 'Rejected';

        expect(GetStoredArtifactSuggestions('artifact:a')[0].Status).toBe('Pending');
        expect(GetStoredArtifactSuggestions('artifact:unknown')).toEqual([]);
    });

    it('retains active suggestion keys without arbitrary count eviction while expiring idle ones after TTL', () => {
        vi.useFakeTimers();
        for (let i = 0; i < 650; i++) {
            SetStoredArtifactSuggestions(`artifact:${i}`, [suggestion(`s-${i}`)]);
        }

        expect(GetStoredArtifactSuggestionKeyCount()).toBe(650);
        expect(GetStoredArtifactSuggestions('artifact:0')).toHaveLength(1);

        // Touch artifact:0 halfway through the TTL so its idle clock restarts; the rest expire
        vi.advanceTimersByTime(STORED_SUGGESTIONS_TTL_MS - 1_000);
        expect(GetStoredArtifactSuggestions('artifact:0')).toHaveLength(1);

        vi.advanceTimersByTime(2_000);
        expect(GetStoredArtifactSuggestionKeyCount()).toBe(1);
        expect(GetStoredArtifactSuggestions('artifact:1')).toEqual([]);
        expect(GetStoredArtifactSuggestions('artifact:0')).toHaveLength(1);
    });

    it('replaces superseded ephemeral content-hash keys when standalone suggestions are accepted', async () => {
        let content = 'hello step 0';
        for (let i = 1; i <= 10; i++) {
            const suggestionId = await propose(content);
            const nextContent = `hello step ${i}`;
            const reviewed = await ExecuteReviewSuggestionTool({
                domain: 'document',
                artifactContent: content,
                input: { suggestionId, decision: 'accept' },
                applyAcceptedSuggestion: async () => ({ ok: true, updatedContent: nextContent, revisionHash: `rev-${i}` }),
            });
            expect(reviewed.success).toBe(true);
            content = nextContent;
        }

        // Only the latest revision's ephemeral hash remains; all 10 superseded revision hashes were deleted
        expect(GetStoredArtifactSuggestionKeyCount()).toBe(1);
        const currentKey = ComputeArtifactSuggestionStoreKey('document', content);
        expect(GetStoredArtifactSuggestions(currentKey)).toHaveLength(10);
        expect(GetStoredArtifactSuggestions(ComputeArtifactSuggestionStoreKey('document', 'hello step 0'))).toEqual([]);
    });

    it('still carries a suggestion from propose through list to review', async () => {
        const content = 'hello world';
        const suggestionId = await propose(content);

        const listed = await ExecuteListSuggestionsTool({
            domain: 'document',
            artifactContent: content,
            input: { status: 'pending' },
        });
        expect((listed.data as { count: number }).count).toBe(1);

        const updatedContent = 'hi world';
        const reviewed = await ExecuteReviewSuggestionTool({
            domain: 'document',
            artifactContent: content,
            input: { suggestionId, decision: 'accept' },
            applyAcceptedSuggestion: async () => ({ ok: true, updatedContent, revisionHash: 'rev-2' }),
        });
        expect(reviewed.success).toBe(true);

        const handedOff = GetStoredArtifactSuggestions(ComputeArtifactSuggestionStoreKey('document', updatedContent));
        expect(handedOff.map((s) => s.Status)).toEqual(['Accepted']);
        expect(GetStoredArtifactSuggestions(ComputeArtifactSuggestionStoreKey('document', content))).toEqual([]);
    });
});
