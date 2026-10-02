/**
 * @fileoverview The decision observations of the memory note gate measurement: built from each
 * decision call, written to `observations.jsonl` (IDs and numbers only), and read back so a report
 * can be rebuilt without a model call.
 *
 * @module @memberjunction/integration-test-suite
 */

import type { DecisionAnswer, JSONObject, JSONValue } from '@memberjunction/ai';
import type { CorpusLabel, CorpusScenario, DecisionObservation, DecisionOutcome } from './corpus-types';
import type { EvaluatedNote } from './evaluator';

/** The file the measurement writes its observations to, next to the report. */
export const OBSERVATIONS_FILE = 'observations.jsonl';

/** What one decision call about a scenario returned, as the observations need it. */
export interface ScenarioDecision {
    Success: boolean;
    Answers: Record<string, DecisionAnswer>;
    ModelName: string;
    /**
     * The exact model behind `ModelName`, as its driver reported it (`DecisionResult.ResolvedModel`),
     * such as Jev's dated version. It ties a fit to the version that answered.
     */
    ResolvedModel?: string;
    LatencyMs: number;
    CostUsd: number;
    PromptRunId?: string;
}

/** A Likelihood answer's probability, or null when the answer is missing, of another kind, or not a finite number. */
function usableProbability(answer: DecisionAnswer | undefined): number | null {
    if (answer?.Kind !== 'Likelihood') {
        return null;
    }
    return typeof answer.Probability === 'number' && Number.isFinite(answer.Probability) ? answer.Probability : null;
}

/**
 * One observation per note of a scenario for one decision call, keyed `n1`, `n2`, … as the gate asks.
 * A failed call, and a note without a usable Likelihood, are recorded as such, never as a probability.
 *
 * @param scenario The scenario asked about.
 * @param rep The rep.
 * @param decision What the call returned.
 */
export function ObservationsForDecision(
    scenario: Pick<CorpusScenario, 'Id' | 'Notes'>,
    rep: number,
    decision: ScenarioDecision
): DecisionObservation[] {
    return scenario.Notes.map((note, i) => {
        const probability = decision.Success ? usableProbability(decision.Answers[`n${i + 1}`]) : null;
        const outcome: DecisionOutcome = !decision.Success ? 'call-failed' : probability === null ? 'no-answer' : 'answered';
        return {
            ScenarioId: scenario.Id,
            NoteId: note.NoteId,
            Rep: rep,
            Outcome: outcome,
            RawProbability: probability,
            ModelName: decision.ModelName,
            ResolvedModel: decision.ResolvedModel,
            LatencyMs: decision.LatencyMs,
            CostUsd: decision.CostUsd / Math.max(1, scenario.Notes.length),
            PromptRunId: decision.PromptRunId
        };
    });
}

/** The notes of a measurement that can be scored, and how many could not. */
export interface EvaluatedNoteSet {
    Notes: EvaluatedNote[];
    /** Notes with no usable answer in any rep. */
    UnscoredNotes: number;
    /** Notes with no label. */
    UnlabelledNotes: number;
}

/**
 * The scored notes: each labelled note's first usable answer, rep 1 first. A note with no label, or
 * with no usable answer in any rep, is counted and left out, never scored.
 *
 * @param scenarios The corpus.
 * @param labels Each note's label, by note ID.
 * @param observations Every rep's observations.
 */
export function BuildEvaluatedNotes(
    scenarios: ReadonlyArray<Pick<CorpusScenario, 'Id' | 'Notes'>>,
    labels: ReadonlyMap<string, CorpusLabel>,
    observations: readonly DecisionObservation[]
): EvaluatedNoteSet {
    const answeredByNote = new Map<string, DecisionObservation[]>();
    for (const obs of [...observations].sort((a, b) => a.Rep - b.Rep)) {
        if (obs.Outcome === 'answered' && obs.RawProbability !== null) {
            answeredByNote.set(obs.NoteId, [...(answeredByNote.get(obs.NoteId) ?? []), obs]);
        }
    }
    const set: EvaluatedNoteSet = { Notes: [], UnscoredNotes: 0, UnlabelledNotes: 0 };
    for (const scenario of scenarios) {
        for (const note of scenario.Notes) {
            const label = labels.get(note.NoteId);
            const first = answeredByNote.get(note.NoteId)?.[0];
            if (!label) {
                set.UnlabelledNotes++;
            } else if (!first || first.RawProbability === null) {
                set.UnscoredNotes++;
            } else {
                set.Notes.push({
                    ScenarioId: scenario.Id,
                    NoteId: note.NoteId,
                    Label: label,
                    IsDurable: label === 'durable',
                    SelfConfidence: note.SelfConfidence ?? null,
                    DecisionRawProbability: first.RawProbability,
                    ModelName: first.ModelName
                });
            }
        }
    }
    return set;
}

/** One `observations.jsonl` line: IDs and numbers only. */
export function SerializeObservation(observation: DecisionObservation): string {
    return JSON.stringify(observation);
}

function isOutcome(value: JSONValue | undefined): value is DecisionOutcome {
    return value === 'answered' || value === 'call-failed' || value === 'no-answer';
}

function isJsonObject(value: JSONValue): value is JSONObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A parsed line as a decision observation, or null when it is not one. */
function readObservation(parsed: JSONValue): DecisionObservation | null {
    if (!isJsonObject(parsed)) {
        return null;
    }
    const { ScenarioId, NoteId, Rep, Outcome, RawProbability, ModelName, ResolvedModel, LatencyMs, CostUsd, PromptRunId } = parsed;
    if (typeof ScenarioId !== 'string' || typeof NoteId !== 'string' || typeof Rep !== 'number' || !isOutcome(Outcome)
        || typeof ModelName !== 'string' || typeof LatencyMs !== 'number' || typeof CostUsd !== 'number') {
        return null;
    }
    const probability = Outcome === 'answered' && typeof RawProbability === 'number' ? RawProbability : null;
    return {
        ScenarioId,
        NoteId,
        Rep,
        Outcome: Outcome === 'answered' && probability === null ? 'no-answer' : Outcome,
        RawProbability: probability,
        ModelName,
        ResolvedModel: typeof ResolvedModel === 'string' ? ResolvedModel : undefined,
        LatencyMs,
        CostUsd,
        PromptRunId: typeof PromptRunId === 'string' ? PromptRunId : undefined
    };
}

/**
 * The observations in `observations.jsonl` text. A line that is not an observation is skipped and
 * counted, so a damaged file shows in the count rather than as missing answers.
 */
export function ParseDecisionObservations(text: string): { Observations: DecisionObservation[]; Skipped: number } {
    const result: { Observations: DecisionObservation[]; Skipped: number } = { Observations: [], Skipped: 0 };
    for (const line of text.split('\n').map(l => l.trim()).filter(l => l.length > 0)) {
        let observation: DecisionObservation | null = null;
        try {
            const parsed: JSONValue = JSON.parse(line);
            observation = readObservation(parsed);
        } catch {
            observation = null;
        }
        if (observation) {
            result.Observations.push(observation);
        } else {
            result.Skipped++;
        }
    }
    return result;
}
