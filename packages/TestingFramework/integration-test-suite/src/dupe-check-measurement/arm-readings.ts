/**
 * @fileoverview How the measurement rig reads each arm's model call: the way production reads it,
 * with failures and missing answers counted rather than dropped.
 *
 * Production's entry check (`DuplicateRecordDetector.CheckRecordValues`) flags a candidate when the
 * decision provider bands it `Uncertain` (`BandCandidate`), so a candidate a successful decision gave
 * no answer for is flagged: a missing probability fails toward inclusion. A failed decision flags
 * nothing. These readers apply the same rules, so the rig scores what production would show.
 *
 * @module @memberjunction/integration-test-suite
 */

import type {
    DecisionReasoningProvider,
    DuplicateDecisionResult,
    DuplicateReasoningInput,
    DuplicateReasoningOutput,
} from '@memberjunction/ai-vector-dupe';
import { NormalizeUUID } from '@memberjunction/global';
import { ContainsRecordText } from './record-text';

/** What an error message becomes when it quotes record text. */
export const WITHHELD_ERROR_MESSAGE = '(withheld: the message quoted record text)';

/** The decision arm's call, read as production's entry check reads it. */
export interface DecisionArmReading {
    Success: boolean;
    /** Why the call failed, when it did; withheld when it quotes record text. */
    ErrorMessage?: string;
    /** Each candidate's probability, by normalized record id; null when the decision gave no answer. */
    Probabilities: Map<string, number | null>;
    /** Whether the entry check flags the candidate, by normalized record id. Empty when the call failed. */
    Flagged: Map<string, boolean>;
    /** Candidates the successful call gave no answer for. */
    MissingAnswers: number;
}

/** The prompt arm's call, with its failures and missing verdicts counted. */
export interface PromptArmReading {
    Success: boolean;
    /** Why the call failed, when it did; withheld when it quotes record text. */
    ErrorMessage?: string;
    /** Each answered candidate's recommendation, by normalized record id. */
    Recommendations: Map<string, 'Merge' | 'NotDuplicate' | 'Uncertain'>;
    /** Candidates asked about that a successful call gave no verdict for. */
    MissingAnswers: number;
}

/**
 * Read one decision call as production's entry check does: a failed call flags nothing; a
 * successful one flags each candidate the provider bands `Uncertain`, which includes every
 * candidate it gave no answer for.
 *
 * @param decision the provider's `DecideCandidates` result
 * @param provider the provider that made it, whose band decides the flags
 * @param recordTexts the entered record's and the candidates' text, kept out of any error message
 */
export function ReadDecisionArm(
    decision: DuplicateDecisionResult,
    provider: Pick<DecisionReasoningProvider, 'BandCandidate'>,
    recordTexts: readonly string[] = []
): DecisionArmReading {
    const reading: DecisionArmReading = {
        Success: decision.Success,
        Probabilities: new Map(),
        Flagged: new Map(),
        MissingAnswers: 0,
    };
    if (!decision.Success) {
        reading.ErrorMessage = WithholdRecordText(decision.ErrorMessage ?? 'Decision failed', recordTexts);
        return reading;
    }
    for (const candidate of decision.Candidates) {
        const id = NormalizeUUID(candidate.RecordID);
        reading.Probabilities.set(id, candidate.Probability);
        reading.Flagged.set(id, provider.BandCandidate(candidate).Recommendation === 'Uncertain');
        if (candidate.Probability === null) {
            reading.MissingAnswers++;
        }
    }
    return reading;
}

/**
 * Read one prompt call, counting a failure and each asked candidate it gave no verdict for.
 *
 * @param output the prompt provider's `Reason` output
 * @param askedIds the record ids of the candidates the prompt was asked about
 * @param recordTexts the entered record's and the candidates' text, kept out of any error message
 */
export function ReadPromptArm(
    output: Pick<DuplicateReasoningOutput, 'Success' | 'ErrorMessage' | 'CandidateVerdicts'>,
    askedIds: readonly string[],
    recordTexts: readonly string[] = []
): PromptArmReading {
    const reading: PromptArmReading = { Success: output.Success, Recommendations: new Map(), MissingAnswers: 0 };
    if (!output.Success) {
        reading.ErrorMessage = WithholdRecordText(output.ErrorMessage ?? 'Prompt failed', recordTexts);
        return reading;
    }
    for (const verdict of output.CandidateVerdicts ?? []) {
        reading.Recommendations.set(NormalizeUUID(verdict.RecordID), verdict.Recommendation);
    }
    reading.MissingAnswers = askedIds.filter(id => !reading.Recommendations.has(NormalizeUUID(id))).length;
    return reading;
}

/** The message, or {@link WITHHELD_ERROR_MESSAGE} when it quotes any of the record texts. */
export function WithholdRecordText(message: string, recordTexts: readonly string[]): string {
    return ContainsRecordText(message, recordTexts) ? WITHHELD_ERROR_MESSAGE : message;
}

/** The text a check's model calls see: the entered values, and the reasoning input's labels and field values. */
export function RecordTextsOf(
    values: Record<string, string>,
    input: Pick<DuplicateReasoningInput, 'SourceRecord' | 'Candidates' | 'FieldDeltas'> | null
): string[] {
    const texts = Object.values(values);
    if (!input) {
        return texts;
    }
    texts.push(input.SourceRecord.Label, ...input.Candidates.map(c => c.Label));
    for (const delta of input.FieldDeltas) {
        for (const value of delta.Values) {
            if (value.Value !== null) {
                texts.push(value.Value);
            }
        }
    }
    return texts;
}
