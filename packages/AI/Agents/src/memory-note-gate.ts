/**
 * @fileoverview Pure typed-decision gate module for extracted memory notes.
 *
 * Implements question generation, state projection, Platt calibration application,
 * and note filtering for durable memory candidates.
 *
 * @module @memberjunction/ai-agents
 */

import {
    ApplyPlattCalibration,
    type DecisionAnswer,
    type LikelihoodQuestion,
    type PlattCalibration
} from '@memberjunction/ai';
import type { AIEngine } from '@memberjunction/aiengine';
import { UUIDsEqual } from '@memberjunction/global';

/**
 * Standard instructions used for Likelihood questions evaluating candidate memory notes.
 */
export const MEMORY_NOTE_QUESTION_INSTRUCTIONS =
    'This note is a correct, durable fact or preference about the user, their organization or how they want the agent to work, that is worth remembering in future conversations; it is not a one-off request, a guess, or a detail of this conversation only.';

/**
 * Maximum character limit for a candidate note's content in the decision state.
 */
export const MEMORY_NOTE_MAX_CONTENT_CHARS = 1000;

/**
 * Maximum character limit for conversation excerpts in the decision state.
 */
export const MEMORY_NOTE_MAX_EXCERPT_CHARS = 4000;

/**
 * The least **calibrated** probability at which a candidate note is kept.
 *
 * Set from the memory-note gate measurement (plan Task 3.4, 2026-09-29): 60 synthetic conversations,
 * 337 candidate notes labelled durable, ephemeral, wrong or speculative, two repeats. At a calibrated
 * 0.6, Jev kept durable notes at 96.1% precision and 95.4% recall, and kept 6.2% of the
 * conversation-only (ephemeral) notes, where today's self-reported `confidence >= 80` kept 40.0% of
 * them at 85.3% precision and 98.7% recall. Neither kept a wrong note; the gate kept 3.4% of the
 * speculative ones, the self-report none.
 */
export const MEMORY_NOTE_MIN_PROBABILITY = 0.6;

/**
 * Per-model Platt calibration of the memory-note Likelihood, keyed by the name MJ gives the model
 * that answered (`modelInfo.modelName`). Fitted on the memory-note gate measurement.
 *
 * Only models that beat the self-reported confidence are listed. LLM Decision was measured and left
 * out: at any threshold it kept more wrong and speculative notes than today's rule (at a calibrated
 * 0.6, 11.5% of wrong notes). A batch answered by a model with no entry here falls back to the
 * self-reported confidence rule, as a failed decision does. Refit whenever a model, its version or
 * the question changes.
 */
export const MEMORY_NOTE_DECISION_CALIBRATION: Readonly<Record<string, PlattCalibration>> =
    Object.freeze({
        'Jev': Object.freeze({ A: 3.6391, B: -5.7059 })
    });

/**
 * Shape of a candidate note evaluated by the decision gate.
 */
export interface MemoryNoteCandidate {
    readonly type: 'Preference' | 'Constraint' | 'Context' | 'Issue' | string;
    readonly content: string;
    readonly confidence?: number;
    readonly scopeLevel?: 'global' | 'company' | 'user' | string;
    readonly agentId?: string | null;
    readonly userId?: string | null;
    readonly companyId?: string | null;
    /** The conversation the note was extracted from: the one it is judged against. */
    readonly sourceConversationId?: string | null;
}

/** One turn of the conversation a note came from, as the gate's state quotes it. */
export interface MemoryNoteExcerptTurn {
    readonly role: string;
    readonly text: string;
}

/** A conversation candidate notes may have come from. */
export interface MemoryNoteConversation {
    readonly ConversationId: string;
    readonly Turns: ReadonlyArray<MemoryNoteExcerptTurn>;
}

/** The candidate notes of one conversation, with that conversation's excerpt: one decision state. */
export interface MemoryNoteConversationBatch<T extends MemoryNoteCandidate = MemoryNoteCandidate> {
    readonly ConversationId: string;
    readonly Excerpt: string;
    readonly Notes: T[];
}

/** Candidate notes grouped by the conversation they came from. */
export interface MemoryNoteConversationGrouping<T extends MemoryNoteCandidate = MemoryNoteCandidate> {
    /** One batch per conversation with notes, in the conversations' order; each keeps its notes' order. */
    readonly Batches: MemoryNoteConversationBatch<T>[];
    /** The notes whose conversation could not be told: they must not be judged against any. */
    readonly Unattributed: T[];
}

/**
 * Projection of a candidate note in the decision state payload.
 */
export interface MemoryNoteStateItem {
    readonly type: string;
    readonly scope: string;
    readonly content: string;
}

/**
 * Decision state object sent with the decision prompt.
 */
export type MemoryNoteDecisionState = {
    readonly notes: Record<string, MemoryNoteStateItem>;
    readonly conversationExcerpt?: string;
};

/**
 * Individual evaluated note verdict.
 */
export interface JudgedMemoryNote<T extends MemoryNoteCandidate = MemoryNoteCandidate> {
    readonly Note: T;
    readonly Key: string;
    readonly RawProbability?: number;
    readonly CalibratedProbability?: number;
    readonly Kept: boolean;
    readonly Reason: string;
}

/**
 * Aggregate verdict for a batch of evaluated memory notes.
 */
export interface MemoryNoteGateVerdict<T extends MemoryNoteCandidate = MemoryNoteCandidate> {
    readonly KeptNotes: T[];
    readonly JudgedNotes: JudgedMemoryNote<T>[];
    readonly ModelName?: string;
    readonly Calibrated: boolean;
}

/**
 * Minimal interface needed from AIEngine to resolve model question limits.
 */
export type MemoryNoteEngineSource = Pick<
    AIEngine,
    'Prompts' | 'PromptModels' | 'ModelVendors' | 'GetEffectiveModelConfiguration'
>;

/**
 * Builds likelihood questions for each candidate note, keyed n1, n2, etc.
 *
 * Each question quotes its own note. Question keys are labels for code, not instructions to the
 * model, and a native decision driver (Jev) may answer each question separately against the state,
 * so a question that only named its key would ask the same thing about every note. Measured: with
 * the note left out of the question, Jev's answers were at chance (AUC 0.51).
 *
 * @param notes The candidate notes to build questions for.
 */
export function BuildMemoryNoteQuestions(
    notes: ReadonlyArray<MemoryNoteCandidate>
): Record<string, LikelihoodQuestion> {
    const questions: Record<string, LikelihoodQuestion> = {};
    for (let i = 0; i < notes.length; i++) {
        questions[`n${i + 1}`] = {
            Kind: 'Likelihood',
            Instructions: MemoryNoteQuestionInstructions(notes[i])
        };
    }
    return questions;
}

/** One note's question: the durable-memory test, then the note itself, capped. */
export function MemoryNoteQuestionInstructions(note: MemoryNoteCandidate): string {
    const content = (note.content ?? '').slice(0, MEMORY_NOTE_MAX_CONTENT_CHARS);
    return `${MEMORY_NOTE_QUESTION_INSTRUCTIONS}\n\nThe note (${note.type}, ${note.scopeLevel ?? 'user'} scope): "${content}"`;
}

/**
 * The conversation a batch of notes came from, as the gate's state quotes it: one `[role]: text`
 * line per turn. The measurement rig wrote its corpus excerpts with this, one conversation per
 * state, which is what the Platt fit and the threshold were set on; {@link BuildMemoryNoteState}
 * caps it.
 *
 * @param turns The conversation's turns, in order.
 */
export function FormatMemoryNoteExcerpt(turns: ReadonlyArray<MemoryNoteExcerptTurn>): string {
    return turns.map(turn => `[${turn.role}]: ${turn.text}`).join('\n');
}

/** The conversation a note names, compared as UUIDs, or null when it names none of them. */
function conversationOf(note: MemoryNoteCandidate, conversations: ReadonlyArray<MemoryNoteConversation>): MemoryNoteConversation | null {
    const source = note.sourceConversationId;
    return source ? conversations.find(c => UUIDsEqual(c.ConversationId, source)) ?? null : null;
}

/**
 * Groups candidate notes by the conversation they came from, so each note is judged against its own
 * conversation, as the gate was measured: one conversation per decision state. A note whose
 * `sourceConversationId` names none of the conversations belongs to the only conversation when there
 * is one; with several, it is unattributed, and must not be judged against another conversation.
 *
 * @param notes The candidate notes.
 * @param conversations The conversations they were extracted from.
 */
export function GroupMemoryNotesByConversation<T extends MemoryNoteCandidate>(
    notes: ReadonlyArray<T>,
    conversations: ReadonlyArray<MemoryNoteConversation>
): MemoryNoteConversationGrouping<T> {
    const byConversation = new Map<MemoryNoteConversation, T[]>();
    const unattributed: T[] = [];
    for (const note of notes) {
        const conversation = conversationOf(note, conversations) ?? (conversations.length === 1 ? conversations[0] : null);
        if (!conversation) {
            unattributed.push(note);
            continue;
        }
        byConversation.set(conversation, [...(byConversation.get(conversation) ?? []), note]);
    }
    const batches = conversations
        .filter(c => byConversation.has(c))
        .map(c => ({ ConversationId: c.ConversationId, Excerpt: FormatMemoryNoteExcerpt(c.Turns), Notes: byConversation.get(c) ?? [] }));
    return { Batches: batches, Unattributed: unattributed };
}

/**
 * Formats source conversation excerpts into a single string within max character limits.
 */
function formatExcerpt(
    sourceExcerpts?: string | Record<string, string> | readonly string[]
): string | undefined {
    if (!sourceExcerpts) {
        return undefined;
    }
    let text: string;
    if (typeof sourceExcerpts === 'string') {
        text = sourceExcerpts.trim();
    } else if (Array.isArray(sourceExcerpts)) {
        text = sourceExcerpts.join('\n---\n').trim();
    } else {
        text = Object.entries(sourceExcerpts)
            .map(([id, excerpt]) => `[${id}]: ${excerpt}`)
            .join('\n---\n')
            .trim();
    }
    return text.length > 0 ? text.slice(0, MEMORY_NOTE_MAX_EXCERPT_CHARS) : undefined;
}

/**
 * Builds the state object for the decision prompt, capping content and excerpts.
 *
 * @param notes Candidate notes to project.
 * @param sourceExcerpts Optional conversation thread context.
 */
export function BuildMemoryNoteState(
    notes: ReadonlyArray<MemoryNoteCandidate>,
    sourceExcerpts?: string | Record<string, string> | readonly string[]
): MemoryNoteDecisionState {
    const notesMap: Record<string, MemoryNoteStateItem> = {};
    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const key = `n${i + 1}`;
        notesMap[key] = {
            type: note.type,
            scope: note.scopeLevel ?? 'user',
            content: (note.content ?? '').slice(0, MEMORY_NOTE_MAX_CONTENT_CHARS)
        };
    }
    const excerpt = formatExcerpt(sourceExcerpts);
    return excerpt ? { notes: notesMap, conversationExcerpt: excerpt } : { notes: notesMap };
}

/**
 * Finds the Platt calibration configuration for a model name (case-insensitive).
 */
function findModelCalibration(
    modelName: string | undefined,
    calibrations: Readonly<Record<string, PlattCalibration>>
): PlattCalibration | undefined {
    if (!modelName) {
        return undefined;
    }
    const direct = calibrations[modelName];
    if (direct) {
        return direct;
    }
    const target = modelName.trim().toLowerCase();
    for (const [key, value] of Object.entries(calibrations)) {
        if (key.trim().toLowerCase() === target) {
            return value;
        }
    }
    return undefined;
}

/**
 * Extracts raw probability from a decision answer if it is a valid Likelihood.
 */
function extractRawProbability(answer: DecisionAnswer | undefined): number | undefined {
    if (!answer || answer.Kind !== 'Likelihood') {
        return undefined;
    }
    if (typeof answer.Probability !== 'number' || !Number.isFinite(answer.Probability)) {
        return undefined;
    }
    return answer.Probability;
}

/**
 * Judges a single note when the model is uncalibrated.
 */
function judgeUncalibratedNote<T extends MemoryNoteCandidate>(
    note: T,
    key: string,
    rawProb: number | undefined,
    modelName?: string
): JudgedMemoryNote<T> {
    const reason = modelName
        ? `Model '${modelName}' has no memory-note calibration, so the gate keeps nothing`
        : 'No answering model was reported, so the gate keeps nothing';
    return {
        Note: note,
        Key: key,
        RawProbability: rawProb,
        Kept: false,
        Reason: reason
    };
}

/**
 * Judges a single note when calibration parameters are present.
 */
function judgeCalibratedNote<T extends MemoryNoteCandidate>(
    note: T,
    key: string,
    rawProb: number | undefined,
    calibration: PlattCalibration,
    threshold: number
): JudgedMemoryNote<T> {
    if (rawProb === undefined) {
        return {
            Note: note,
            Key: key,
            Kept: false,
            Reason: `Missing or invalid Likelihood answer for question '${key}'`
        };
    }
    const calProb = ApplyPlattCalibration(rawProb, calibration);
    const kept = calProb >= threshold;
    const reason = kept
        ? `Calibrated probability ${calProb.toFixed(4)} >= threshold ${threshold}`
        : `Calibrated probability ${calProb.toFixed(4)} < threshold ${threshold}`;
    return {
        Note: note,
        Key: key,
        RawProbability: rawProb,
        CalibratedProbability: calProb,
        Kept: kept,
        Reason: reason
    };
}

/**
 * Evaluates decision answers against candidate notes using Platt calibration.
 *
 * An uncalibrated model keeps nothing (fails safe toward writing no durable memory).
 *
 * @param answers The answers returned by the decision runner.
 * @param notes The candidate notes evaluated.
 * @param modelName The answering model name.
 * @param threshold The probability threshold to keep a note (default: 0.5).
 * @param calibrations Optional calibration map override (defaults to MEMORY_NOTE_DECISION_CALIBRATION).
 */
export function JudgeMemoryNotes<T extends MemoryNoteCandidate = MemoryNoteCandidate>(
    answers: Record<string, DecisionAnswer> | undefined,
    notes: ReadonlyArray<T>,
    modelName?: string,
    threshold: number = MEMORY_NOTE_MIN_PROBABILITY,
    calibrations: Readonly<Record<string, PlattCalibration>> = MEMORY_NOTE_DECISION_CALIBRATION
): MemoryNoteGateVerdict<T> {
    const calibration = findModelCalibration(modelName, calibrations);
    const judgedNotes: JudgedMemoryNote<T>[] = [];

    for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const key = `n${i + 1}`;
        const rawProb = extractRawProbability(answers?.[key]);

        const judged = calibration
            ? judgeCalibratedNote(note, key, rawProb, calibration, threshold)
            : judgeUncalibratedNote(note, key, rawProb, modelName);

        judgedNotes.push(judged);
    }

    const keptNotes = judgedNotes.filter(j => j.Kept).map(j => j.Note);
    return {
        KeptNotes: keptNotes,
        JudgedNotes: judgedNotes,
        ModelName: modelName,
        Calibrated: calibration !== undefined
    };
}

/**
 * Looks up the prompt's configured MaxQuestionsPerCall limit from active PromptModels.
 *
 * @param engine AIEngine metadata source.
 * @param promptName Name of the decision prompt (default: 'Default Decision').
 */
export function MemoryNotePromptQuestionCap(
    engine: MemoryNoteEngineSource,
    promptName: string = 'Default Decision'
): number | undefined {
    const target = promptName.trim().toLowerCase();
    const prompt = engine.Prompts?.find(p => (p.Name ?? '').trim().toLowerCase() === target);
    if (!prompt) {
        return undefined;
    }
    const caps = (engine.PromptModels ?? [])
        .filter(pm => UUIDsEqual(pm.PromptID, prompt.ID) && (pm.Status === 'Active' || pm.Status === 'Preview'))
        .map(pm => {
            const modelVendor = pm.VendorID
                ? (engine.ModelVendors ?? []).find(
                      mv => UUIDsEqual(mv.ModelID, pm.ModelID) && UUIDsEqual(mv.VendorID, pm.VendorID)
                  )
                : undefined;
            return engine.GetEffectiveModelConfiguration(pm.ModelID, modelVendor?.ID)?.Decision
                ?.MaxQuestionsPerCall;
        });
    const declared = caps.filter((cap): cap is number => typeof cap === 'number' && cap > 0);
    return declared.length > 0 ? Math.min(...declared) : undefined;
}

/**
 * Splits candidate notes into chunks not exceeding the specified chunk size.
 *
 * @param notes The notes to chunk.
 * @param chunkSize Maximum number of notes per chunk.
 */
export function ChunkMemoryNotes<T>(notes: ReadonlyArray<T>, chunkSize?: number): T[][] {
    if (!chunkSize || chunkSize <= 0 || !Number.isFinite(chunkSize) || notes.length <= chunkSize) {
        return [Array.from(notes)];
    }
    const chunks: T[][] = [];
    for (let i = 0; i < notes.length; i += chunkSize) {
        chunks.push(notes.slice(i, i + chunkSize));
    }
    return chunks;
}
