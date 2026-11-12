/**
 * @fileoverview The Memory Manager's closed-set LLM calls, asked as typed decisions: whether a
 * candidate note or example duplicates what is already stored, and whether two stored notes
 * contradict each other.
 *
 * Each use runs through `RunDecisionUse` (`@memberjunction/ai-prompts`) in the mode the run names in
 * `data.memoryDecisionMode` (`Prompt`, `Shadow` or `Decision`), defaulting to
 * {@link MEMORY_DECISION_DEFAULT_MODE}. None of the three has a fitted calibration yet, so the
 * default is `Shadow`: the LLM prompt still decides, and every shadow run records the decision's raw
 * answer next to the prompt's verdict as labelled data for the `fit-decision-calibration` rig. Once a
 * fit ships on the answering model's `ModelConfiguration.Decision.Calibrations` under these use and
 * question keys, `Decision` mode acts on it. Until then, `Decision` mode finds no calibration, treats
 * every answer as unsure and falls back to the prompt, so switching the mode early changes nothing.
 *
 * What stays in code: everything that is not a closed-set judgment. The contradiction prompt also
 * extracted entity triples (only ever counted) and picked which note wins; the winner follows the
 * prompt's own stated rule (recency beyond seven days, then importance, then access count, a tie
 * keeping both), so the decision path applies that rule deterministically
 * ({@link PickContradictionAuthority}) and asks the model only whether the notes conflict.
 *
 * Pure: no I/O, so each rule is unit-tested on its own.
 *
 * @module @memberjunction/ai-agents
 */

import type { DecisionAnswer, LikelihoodQuestion } from '@memberjunction/ai';
import {
    CalibrateDecisionProbability,
    DescribeAnsweringModel,
    type DecisionAnsweringModel,
    type DecisionCalibrationKey,
    type DecisionCalibrationSource
} from '@memberjunction/ai-core-plus';
import type { DecisionUseMode, ShadowDecisionComparison } from '@memberjunction/ai-prompts';

/** The mode a Memory Manager run uses for these calls when `data.memoryDecisionMode` names none. */
export const MEMORY_DECISION_DEFAULT_MODE: DecisionUseMode = 'Shadow';

/** The decision use for "does this candidate note duplicate a stored note?". */
export const MEMORY_NOTE_DEDUPE_USE = 'memory-note-dedupe';

/** The decision use for "does this candidate example duplicate a stored example?". */
export const MEMORY_EXAMPLE_DEDUPE_USE = 'memory-example-dedupe';

/** The decision use for "do these two stored notes contradict each other?". */
export const MEMORY_CONTRADICTION_USE = 'memory-contradiction';

/** The question key of both dedupe uses: the candidate adds nothing the stored items do not. */
export const MEMORY_DUPLICATE_QUESTION = 'duplicate';

/** The question key of the contradiction use: the two notes cannot both be true now. */
export const MEMORY_CONTRADICTS_QUESTION = 'contradicts';

/** The calibration keys, one per use. */
export const MEMORY_NOTE_DEDUPE_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({ Use: MEMORY_NOTE_DEDUPE_USE, Question: MEMORY_DUPLICATE_QUESTION });
export const MEMORY_EXAMPLE_DEDUPE_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({ Use: MEMORY_EXAMPLE_DEDUPE_USE, Question: MEMORY_DUPLICATE_QUESTION });
export const MEMORY_CONTRADICTION_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({ Use: MEMORY_CONTRADICTION_USE, Question: MEMORY_CONTRADICTS_QUESTION });

/**
 * The bands a **calibrated** probability is read in, for each yes/no these uses ask. At or above
 * `Yes` the answer is yes; at or below `No` it is no; between them it is unsure and the LLM prompt
 * answers. The gap is deliberate: no use has been measured yet, and an unsure band that sends the
 * middle back to the prompt costs a call where a single threshold would cost a wrong write. Narrow
 * it when a fit and its measurement ship.
 */
export interface MemoryDecisionBands {
    readonly Yes: number;
    readonly No: number;
}

/** The provisional bands for every Memory Manager decision use. */
export const MEMORY_DECISION_BANDS: MemoryDecisionBands = Object.freeze({ Yes: 0.7, No: 0.3 });

/** Characters of a note, an example input or an example output quoted in a decision's state. */
export const MEMORY_DECISION_MAX_TEXT_CHARS = 1500;

/** Days by which the newer note must postdate the older for recency alone to decide a contradiction. */
export const CONTRADICTION_RECENCY_DAYS = 7;

/** The dedupe prompt's verdict, the shape both dedupe calls return. */
export interface MemoryDedupeVerdict {
    shouldAdd: boolean;
    reason: string;
}

/** The contradiction verdict the Memory Manager acts on. */
export interface MemoryContradictionVerdict {
    isContradiction: boolean;
    keepNoteId?: string;
    revokeNoteId?: string;
    reason: string;
    /** Entity triples the LLM prompt extracted; always 0 for a decision's verdict, which extracts none. */
    triplesExtracted: number;
}

/** A stored note as the dedupe decision quotes it. */
export interface MemoryDedupeNote {
    readonly type: string;
    readonly content: string;
    readonly similarity: number;
}

/** A stored example as the dedupe decision quotes it. */
export interface MemoryDedupeExample {
    readonly input: string;
    readonly output: string;
    readonly successScore?: number | null;
    readonly similarity: number;
}

/** A note in a contradiction pair: the fields the decision quotes and the authority rule reads. */
export interface MemoryContradictionNote {
    readonly ID: string;
    readonly Type: string;
    readonly Note: string | null;
    readonly CreatedAt: Date | string | null;
    readonly ImportanceScore: number | null;
    readonly AccessCount: number | null;
}

/** A decision's state and its one question. */
export interface MemoryDecisionRequest {
    readonly State: Record<string, unknown>;
    readonly Questions: Record<string, LikelihoodQuestion>;
}

/** How a calibrated yes/no read: its band, and the probabilities behind it. */
export interface MemoryDecisionReading {
    readonly Band: 'Yes' | 'No' | 'Unsure';
    readonly RawProbability?: number;
    readonly CalibratedProbability?: number;
    readonly Reason: string;
}

const NOTE_DUPLICATE_INSTRUCTIONS =
    'The candidate note is redundant: an agent holding only the existing notes would act exactly as it would with the candidate added (the same advice, tools, constraints and assumptions about the user). Rewording, reframing, added justification or backstory do not make it different; a genuinely broader or narrower scope, a different tool, domain, constraint or fact does.';

const EXAMPLE_DUPLICATE_INSTRUCTIONS =
    'The candidate example adds nothing the existing examples do not already show: it repeats a pattern they cover, as a minor variation or at lower quality. It is not redundant when it shows a different aspect, edge case or approach, or a clearly better response.';

const CONTRADICTS_INSTRUCTIONS =
    'Note A and note B cannot both be true now: they assert different values for the same attribute of the same subject, or one states a changed policy or practice that the other contradicts. Complementary facts, different attributes, similar wording about different things, and a one-off exception to a stated policy are not contradictions.';

/** Text capped for a decision's state. */
function cap(text: string | null | undefined): string {
    return (text ?? '').slice(0, MEMORY_DECISION_MAX_TEXT_CHARS);
}

/**
 * The note dedupe decision: the candidate and its similar stored notes as state, one Likelihood that
 * the candidate is redundant.
 *
 * @param candidate The candidate note.
 * @param similar The stored notes the semantic search found near it.
 */
export function BuildNoteDedupeDecision(candidate: { type: string; content: string }, similar: ReadonlyArray<MemoryDedupeNote>): MemoryDecisionRequest {
    return {
        State: {
            candidateNote: { type: candidate.type, content: cap(candidate.content) },
            existingNotes: similar.map(n => ({ type: n.type, content: cap(n.content), similarity: roundSimilarity(n.similarity) }))
        },
        Questions: { [MEMORY_DUPLICATE_QUESTION]: { Kind: 'Likelihood', Instructions: NOTE_DUPLICATE_INSTRUCTIONS } }
    };
}

/**
 * The example dedupe decision: the candidate and its similar stored examples as state, one Likelihood
 * that the candidate is redundant.
 *
 * @param candidate The candidate example.
 * @param similar The stored examples the semantic search found near it.
 */
export function BuildExampleDedupeDecision(
    candidate: { exampleInput: string; exampleOutput: string; successScore?: number | null },
    similar: ReadonlyArray<MemoryDedupeExample>
): MemoryDecisionRequest {
    return {
        State: {
            candidateExample: { input: cap(candidate.exampleInput), output: cap(candidate.exampleOutput), successScore: candidate.successScore ?? null },
            existingExamples: similar.map(e => ({ input: cap(e.input), output: cap(e.output), successScore: e.successScore ?? null, similarity: roundSimilarity(e.similarity) }))
        },
        Questions: { [MEMORY_DUPLICATE_QUESTION]: { Kind: 'Likelihood', Instructions: EXAMPLE_DUPLICATE_INSTRUCTIONS } }
    };
}

/**
 * The contradiction decision: the two notes as state, one Likelihood that they conflict. Which note
 * wins is not asked: {@link PickContradictionAuthority} applies the rule the prompt states.
 *
 * @param noteA The first note.
 * @param noteB The second note.
 */
export function BuildContradictionDecision(noteA: MemoryContradictionNote, noteB: MemoryContradictionNote): MemoryDecisionRequest {
    return {
        State: { noteA: contradictionNoteState(noteA), noteB: contradictionNoteState(noteB) },
        Questions: { [MEMORY_CONTRADICTS_QUESTION]: { Kind: 'Likelihood', Instructions: CONTRADICTS_INSTRUCTIONS } }
    };
}

function contradictionNoteState(note: MemoryContradictionNote): Record<string, unknown> {
    return { type: note.Type, content: cap(note.Note), importanceScore: note.ImportanceScore ?? null, accessCount: note.AccessCount ?? 0 };
}

function roundSimilarity(similarity: number): number {
    return Math.round(similarity * 100) / 100;
}

/**
 * Reads one Likelihood answer against its calibration and the bands. Unsure when the answer is
 * missing or not a Likelihood, when the answering model has no calibration for this use and question,
 * or when the calibrated probability falls between the bands.
 *
 * @param answer The answer to the use's question.
 * @param key The use and question, for the calibration lookup.
 * @param answeredBy The model that answered.
 * @param calibrations Where calibrations are declared, normally `AIEngine.Instance`.
 * @param bands The yes and no bands (default: {@link MEMORY_DECISION_BANDS}).
 */
export function ReadMemoryDecision(
    answer: DecisionAnswer | undefined,
    key: DecisionCalibrationKey,
    answeredBy: DecisionAnsweringModel,
    calibrations: DecisionCalibrationSource | null | undefined,
    bands: MemoryDecisionBands = MEMORY_DECISION_BANDS
): MemoryDecisionReading {
    const raw = answer?.Kind === 'Likelihood' && typeof answer.Probability === 'number' && Number.isFinite(answer.Probability)
        ? answer.Probability
        : undefined;
    if (raw === undefined) {
        return { Band: 'Unsure', Reason: `No Likelihood answer to '${key.Question}'` };
    }
    const calibrated = CalibrateDecisionProbability(calibrations, key, raw, answeredBy);
    if (calibrated === null) {
        return { Band: 'Unsure', RawProbability: raw, Reason: `${DescribeAnsweringModel(answeredBy)} has no '${key.Use}' calibration` };
    }
    const band = calibrated >= bands.Yes ? 'Yes' : calibrated <= bands.No ? 'No' : 'Unsure';
    return { Band: band, RawProbability: raw, CalibratedProbability: calibrated, Reason: `calibrated '${key.Question}' ${calibrated.toFixed(4)} (${band})` };
}

/**
 * The dedupe verdict from a decision, or null when it is unsure. A redundant candidate is not added.
 *
 * @param answers The decision's answers.
 * @param key The dedupe use's calibration key.
 * @param answeredBy The model that answered.
 * @param calibrations Where calibrations are declared.
 */
export function DedupeVerdictFromDecision(
    answers: Record<string, DecisionAnswer>,
    key: DecisionCalibrationKey,
    answeredBy: DecisionAnsweringModel,
    calibrations: DecisionCalibrationSource | null | undefined
): MemoryDedupeVerdict | null {
    const reading = ReadMemoryDecision(answers[key.Question], key, answeredBy, calibrations);
    if (reading.Band === 'Unsure') {
        return null;
    }
    return { shouldAdd: reading.Band === 'No', reason: `decision: ${reading.Reason}` };
}

/**
 * The contradiction verdict from a decision, or null when it is unsure. A contradiction names its
 * winner by {@link PickContradictionAuthority}; when that rule ties, the prompt keeps both, so the
 * verdict is no contradiction.
 *
 * @param answers The decision's answers.
 * @param noteA The first note.
 * @param noteB The second note.
 * @param answeredBy The model that answered.
 * @param calibrations Where calibrations are declared.
 */
export function ContradictionVerdictFromDecision(
    answers: Record<string, DecisionAnswer>,
    noteA: MemoryContradictionNote,
    noteB: MemoryContradictionNote,
    answeredBy: DecisionAnsweringModel,
    calibrations: DecisionCalibrationSource | null | undefined
): MemoryContradictionVerdict | null {
    const reading = ReadMemoryDecision(answers[MEMORY_CONTRADICTS_QUESTION], MEMORY_CONTRADICTION_CALIBRATION_KEY, answeredBy, calibrations);
    if (reading.Band === 'Unsure') {
        return null;
    }
    if (reading.Band === 'No') {
        return { isContradiction: false, reason: `decision: ${reading.Reason}`, triplesExtracted: 0 };
    }
    const authority = PickContradictionAuthority(noteA, noteB);
    if (!authority) {
        return { isContradiction: false, reason: `decision: ${reading.Reason}; recency, importance and access count tie, so both are kept`, triplesExtracted: 0 };
    }
    return {
        isContradiction: true,
        keepNoteId: authority.Keep.ID,
        revokeNoteId: authority.Revoke.ID,
        reason: `decision: ${reading.Reason}; ${authority.Reason}`,
        triplesExtracted: 0
    };
}

/** Which note of a contradicting pair is authoritative, and why. */
export interface ContradictionAuthority {
    readonly Keep: MemoryContradictionNote;
    readonly Revoke: MemoryContradictionNote;
    readonly Reason: string;
}

/**
 * The authoritative note of a contradicting pair, by the rule the contradiction prompt states: the
 * newer note when it is more than {@link CONTRADICTION_RECENCY_DAYS} days newer; otherwise the higher
 * importance score; otherwise the higher access count. Null on a tie, which keeps both.
 *
 * @param noteA The first note.
 * @param noteB The second note.
 */
export function PickContradictionAuthority(noteA: MemoryContradictionNote, noteB: MemoryContradictionNote): ContradictionAuthority | null {
    const ageGapDays = (timeOf(noteB) - timeOf(noteA)) / 86_400_000;
    if (Number.isFinite(ageGapDays) && Math.abs(ageGapDays) > CONTRADICTION_RECENCY_DAYS) {
        return ageGapDays > 0
            ? { Keep: noteB, Revoke: noteA, Reason: 'note B is more than 7 days newer' }
            : { Keep: noteA, Revoke: noteB, Reason: 'note A is more than 7 days newer' };
    }
    const byImportance = compareSignal(noteA.ImportanceScore, noteB.ImportanceScore, 'importance score');
    if (byImportance) {
        return byImportance(noteA, noteB);
    }
    const byAccess = compareSignal(noteA.AccessCount, noteB.AccessCount, 'access count');
    return byAccess ? byAccess(noteA, noteB) : null;
}

function timeOf(note: MemoryContradictionNote): number {
    if (!note.CreatedAt) {
        return Number.NaN;
    }
    return note.CreatedAt instanceof Date ? note.CreatedAt.getTime() : Date.parse(note.CreatedAt);
}

/** A picker for the higher of two signals, or null when they are equal or either is missing. */
function compareSignal(
    a: number | null,
    b: number | null,
    label: string
): ((noteA: MemoryContradictionNote, noteB: MemoryContradictionNote) => ContradictionAuthority) | null {
    if (typeof a !== 'number' || typeof b !== 'number' || !Number.isFinite(a) || !Number.isFinite(b) || a === b) {
        return null;
    }
    return a > b
        ? (noteA, noteB) => ({ Keep: noteA, Revoke: noteB, Reason: `note A has the higher ${label}` })
        : (noteA, noteB) => ({ Keep: noteB, Revoke: noteA, Reason: `note B has the higher ${label}` });
}

/**
 * How a dedupe decision compares with the prompt's verdict, for a shadow run. The prompt's verdict
 * is the label for a later fit: the question asks "redundant?", so its truth is `!shouldAdd`. Without
 * a calibration the raw probability is compared at 0.5, which is only the agreement figure; the fit
 * reads the raw answer from the run's `Result`.
 *
 * @param answers The decision's answers.
 * @param existing The prompt's verdict.
 * @param key The dedupe use's calibration key.
 * @param answeredBy The model that answered.
 * @param calibrations Where calibrations are declared.
 */
export function CompareDedupeDecision(
    answers: Record<string, DecisionAnswer>,
    existing: MemoryDedupeVerdict,
    key: DecisionCalibrationKey,
    answeredBy: DecisionAnsweringModel,
    calibrations: DecisionCalibrationSource | null | undefined
): ShadowDecisionComparison {
    return compareYesNo(answers, !existing.shouldAdd, key, answeredBy, calibrations, existing.shouldAdd ? 'LLM added it' : 'LLM rejected it as a duplicate');
}

/**
 * How a contradiction decision compares with the prompt's verdict, for a shadow run; the label is the
 * prompt's `isContradiction`.
 *
 * @param answers The decision's answers.
 * @param existing The prompt's verdict, or null when the prompt failed (then nothing is compared).
 * @param answeredBy The model that answered.
 * @param calibrations Where calibrations are declared.
 */
export function CompareContradictionDecision(
    answers: Record<string, DecisionAnswer>,
    existing: MemoryContradictionVerdict | null,
    answeredBy: DecisionAnsweringModel,
    calibrations: DecisionCalibrationSource | null | undefined
): ShadowDecisionComparison {
    if (!existing) {
        return { Agreed: false, Summary: 'the LLM prompt gave no verdict to compare with', Details: { Question: MEMORY_CONTRADICTS_QUESTION } };
    }
    return compareYesNo(answers, existing.isContradiction, MEMORY_CONTRADICTION_CALIBRATION_KEY, answeredBy, calibrations,
        existing.isContradiction ? 'LLM found a contradiction' : 'LLM found none');
}

/** Compares one yes/no answer with the prompt's yes/no. */
function compareYesNo(
    answers: Record<string, DecisionAnswer>,
    existingYes: boolean,
    key: DecisionCalibrationKey,
    answeredBy: DecisionAnsweringModel,
    calibrations: DecisionCalibrationSource | null | undefined,
    existingSummary: string
): ShadowDecisionComparison {
    const reading = ReadMemoryDecision(answers[key.Question], key, answeredBy, calibrations);
    const decisionYes = reading.CalibratedProbability !== undefined
        ? reading.Band === 'Yes' ? true : reading.Band === 'No' ? false : null
        : reading.RawProbability !== undefined ? reading.RawProbability >= 0.5 : null;
    const decisionSummary = decisionYes === null ? `decision unsure (${reading.Reason})` : `decision said ${decisionYes ? 'yes' : 'no'} to '${key.Question}'`;
    return {
        Agreed: decisionYes === existingYes,
        Summary: `${decisionSummary}, ${existingSummary}`,
        Details: {
            Question: key.Question,
            Label: existingYes,
            RawProbability: reading.RawProbability ?? null,
            CalibratedProbability: reading.CalibratedProbability ?? null,
            Band: reading.Band
        }
    };
}
