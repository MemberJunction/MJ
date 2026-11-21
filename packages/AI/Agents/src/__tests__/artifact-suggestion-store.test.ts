/**
 * Memory-leak audit Round 23: the in-process artifact suggestion store (shared by the document,
 * spreadsheet and slide-deck tool libraries) was a process-global `Map` that gained a key for every
 * artifact a suggestion tool touched, and for every distinct content hash in the standalone path,
 * and was never trimmed. It is now a bounded LRU with a TTL.
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
    MAX_STORED_SUGGESTION_KEYS,
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

    it('holds at most MAX_STORED_SUGGESTION_KEYS keys, dropping the least recently used', () => {
        for (let i = 0; i < MAX_STORED_SUGGESTION_KEYS + 100; i++) {
            SetStoredArtifactSuggestions(`artifact:${i}`, [suggestion(`s-${i}`)]);
        }

        expect(GetStoredArtifactSuggestionKeyCount()).toBe(MAX_STORED_SUGGESTION_KEYS);
        expect(GetStoredArtifactSuggestions('artifact:0')).toEqual([]);
        expect(GetStoredArtifactSuggestions(`artifact:${MAX_STORED_SUGGESTION_KEYS + 99}`)).toHaveLength(1);
    });

    it('stays bounded when the propose tool runs against ever-changing standalone content', async () => {
        for (let i = 0; i < MAX_STORED_SUGGESTION_KEYS + 50; i++) {
            await propose(`hello from document revision ${i}`);
        }

        expect(GetStoredArtifactSuggestionKeyCount()).toBe(MAX_STORED_SUGGESTION_KEYS);
    });

    it('forgets a key nobody touched for the TTL', () => {
        vi.useFakeTimers();
        SetStoredArtifactSuggestions('artifact:stale', [suggestion('s1')]);

        vi.advanceTimersByTime(STORED_SUGGESTIONS_TTL_MS + 1);

        expect(GetStoredArtifactSuggestions('artifact:stale')).toEqual([]);
        expect(GetStoredArtifactSuggestionKeyCount()).toBe(0);
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

        // The accepted list is mirrored under the new content's key, so a follow-up call on the
        // updated document still sees it.
        const mirrored = GetStoredArtifactSuggestions(ComputeArtifactSuggestionStoreKey('document', updatedContent));
        expect(mirrored.map((s) => s.Status)).toEqual(['Accepted']);
    });
});
