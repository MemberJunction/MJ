/**
 * @fileoverview Scores candidate memory notes with self-reported confidence using
 * the exact production extraction prompt guidance, without exposing ground truth labels.
 *
 * @module @memberjunction/integration-test-suite
 */

import type { BaseLLM } from '@memberjunction/ai';
import type { RawGeneratedCandidate } from './corpus-types';

/**
 * Exact confidence scoring guidance loaded from the production extraction prompt
 * (see migrations/v5/B202605291452__v5.38.x__Baseline.sql).
 */
export const MEMORY_NOTE_CONFIDENCE_PROMPT_GUIDANCE =
`Assign a confidence score (0-100) reflecting how certain you are this is an accurate, durable learning:
- 90-100: Explicitly stated user preferences or rules ("Always use TypeScript", "Never touch production DB")
- 75-89: Strongly implied preferences with repeated pattern ("User consistently asks for concise responses")
- 50-74: Possible preferences or one-off corrections that may not generalize
- Below 50: Do not extract (skip entirely)`;

/** Shape of candidate note presented for confidence scoring (no label). */
export interface ScorableCandidate {
    NoteId: string;
    Type: string;
    ScopeLevel: string;
    Content: string;
}

/**
 * Builds prompt string for self-reported confidence scoring.
 * Crucially, does NOT include any ground-truth labels.
 */
export function BuildConfidenceScoringPrompt(
    excerpt: string,
    notes: readonly ScorableCandidate[]
): string {
    const notesJson = JSON.stringify(
        notes.map(n => ({
            noteId: n.NoteId,
            type: n.Type,
            scopeLevel: n.ScopeLevel,
            content: n.Content
        })),
        null,
        2
    );

    return `You are evaluating extracted candidate memory notes from an agent conversation.
Your task is to assign a confidence score (0-100) to each candidate note using ONLY the conversation excerpt and the exact scoring criteria below.

## Scoring Guidance
${MEMORY_NOTE_CONFIDENCE_PROMPT_GUIDANCE}

## Conversation Excerpt
${excerpt}

## Candidate Notes
${notesJson}

## Response Requirement
Respond with valid JSON only. Do not include markdown formatting or commentary.
Return an object with a "scores" map from noteId to numeric score (0-100):
{
  "scores": {
    "n1": 95,
    "n2": 60
  }
}`;
}

/**
 * Parses and validates confidence scores from model response.
 * Clamps scores to [0, 100] and defaults missing scores to 50.
 */
export function ParseConfidenceScores(
    responseText: string,
    expectedNoteIds: readonly string[]
): Record<string, number> {
    const cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch {
        throw new Error(`Failed to parse confidence scoring response as JSON: ${responseText.slice(0, 100)}...`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Confidence scoring response must be an object');
    }

    const rootObj = parsed as Record<string, unknown>;
    const rawScores = (typeof rootObj.scores === 'object' && rootObj.scores !== null)
        ? (rootObj.scores as Record<string, unknown>)
        : rootObj;

    const result: Record<string, number> = {};
    for (const noteId of expectedNoteIds) {
        const val = rawScores[noteId];
        if (typeof val === 'number' && !Number.isNaN(val)) {
            result[noteId] = Math.max(0, Math.min(100, Math.round(val)));
        } else if (typeof val === 'string' && !Number.isNaN(Number(val))) {
            result[noteId] = Math.max(0, Math.min(100, Math.round(Number(val))));
        } else {
            result[noteId] = 50; // Fallback default
        }
    }

    return result;
}

/**
 * Calls chat driver to score candidate notes with at most 2 retries.
 */
export async function ScoreNotesWithRetry(
    driver: BaseLLM,
    modelName: string,
    excerpt: string,
    notes: readonly ScorableCandidate[],
    maxRetries: number = 2
): Promise<Record<string, number>> {
    const noteIds = notes.map(n => n.NoteId);
    const prompt = BuildConfidenceScoringPrompt(excerpt, notes);

    let lastError: unknown = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await driver.ChatCompletion({
                model: modelName,
                messages: [{ role: 'user', content: prompt }]
            });
            const text = result.data.choices[0]?.message?.content ?? '';
            return ParseConfidenceScores(text, noteIds);
        } catch (err) {
            lastError = err;
        }
    }

    throw new Error(`Confidence scoring failed after ${maxRetries} retries: ${String(lastError)}`);
}
