import { describe, it, expect, vi } from 'vitest';
import { ChatResult, type BaseLLM } from '@memberjunction/ai';
import {
    BuildConfidenceScoringPrompt,
    MEMORY_NOTE_CONFIDENCE_PROMPT_GUIDANCE,
    ParseConfidenceScores,
    ScoreNotesWithRetry,
    type ScorableCandidate
} from '../../memory-gate-measurement/confidence-scorer';

/** A chat reply whose only choice says `content`. */
function reply(content: string): ChatResult {
    const result = new ChatResult(true, new Date(), new Date());
    result.data = { choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop', index: 0 }] };
    return result;
}

describe('confidence-scorer', () => {
    const sampleNotes: ScorableCandidate[] = [
        { NoteId: 'n1', Type: 'Preference', ScopeLevel: 'user', Content: 'Prefers TypeScript' },
        { NoteId: 'n2', Type: 'Context', ScopeLevel: 'company', Content: 'Project deadline is Friday' }
    ];
    const sampleExcerpt = '[user]: I only use TypeScript.\n[assistant]: Understood.';

    it('builds prompt containing excerpt, guidance, and notes without ground truth labels', () => {
        const prompt = BuildConfidenceScoringPrompt(sampleExcerpt, sampleNotes);

        expect(prompt).toContain(MEMORY_NOTE_CONFIDENCE_PROMPT_GUIDANCE);
        expect(prompt).toContain('[user]: I only use TypeScript.');
        expect(prompt).toContain('n1');
        expect(prompt).toContain('Prefers TypeScript');
        // Crucial test: ground truth label property must NEVER be present in the prompt
        expect(prompt).not.toContain('"label"');
        expect(prompt).not.toContain('ephemeral');
        expect(prompt).not.toContain('wrong');
        expect(prompt).not.toContain('speculative');
    });

    it('parses valid numeric confidence scores', () => {
        const response = JSON.stringify({
            scores: {
                n1: 95,
                n2: 40
            }
        });
        const parsed = ParseConfidenceScores(response, ['n1', 'n2']);
        expect(parsed).toEqual({
            n1: 95,
            n2: 40
        });
    });

    it('handles markdown code fences and string numbers, clamping [0, 100]', () => {
        const response = '```json\n{\n  "scores": {\n    "n1": "120",\n    "n2": "-15"\n  }\n}\n```';
        const parsed = ParseConfidenceScores(response, ['n1', 'n2']);
        expect(parsed).toEqual({
            n1: 100,
            n2: 0
        });
    });

    it('leaves a missing or invalid note score out, so it is counted as missing rather than as 50', () => {
        const response = JSON.stringify({
            scores: {
                n1: 85,
                n3: 'not a number',
                n4: ''
            }
        });
        const parsed = ParseConfidenceScores(response, ['n1', 'n2', 'n3', 'n4']);
        expect(parsed).toEqual({ n1: 85 });
    });

    it('retries when response fails to parse, succeeding on retry', async () => {
        let calls = 0;
        const mockDriver: Pick<BaseLLM, 'ChatCompletion'> = {
            ChatCompletion: vi.fn(async (): Promise<ChatResult> => {
                calls++;
                return calls === 1 ? reply('not valid json') : reply(JSON.stringify({ scores: { n1: 90, n2: 70 } }));
            })
        };

        const scores = await ScoreNotesWithRetry(mockDriver, 'test-model', sampleExcerpt, sampleNotes, 2);
        expect(calls).toBe(2);
        expect(scores).toEqual({ n1: 90, n2: 70 });
    });

    it('throws error when all retries fail', async () => {
        const mockDriver: Pick<BaseLLM, 'ChatCompletion'> = {
            ChatCompletion: vi.fn(async (): Promise<ChatResult> => reply('broken json'))
        };

        await expect(ScoreNotesWithRetry(mockDriver, 'test-model', sampleExcerpt, sampleNotes, 1))
            .rejects.toThrow(/Confidence scoring failed after 1 retries/);
    });
});
