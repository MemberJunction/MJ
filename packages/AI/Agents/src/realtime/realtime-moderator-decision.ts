/**
 * @fileoverview The realtime turn moderator's "who speaks next" asked as a typed decision: one
 * Likelihood per roster agent that it should speak now, the speakers ordered by probability.
 *
 * The moderator prompt answers the same closed-set question with free text, a call that has to fit an
 * 800 ms budget. A native decision model answers all the agents in one forward pass. The moderator
 * runs both through `RunDecisionUse` in the room's `decisionMode` (default `Shadow`), so the prompt
 * stays the authority until a calibration is fitted on the recorded shadow runs under
 * {@link REALTIME_MODERATOR_CALIBRATION_KEY}. Until one ships for the answering model, `Decision` mode
 * reads every answer as unsure and falls back to the prompt.
 *
 * No I/O: calibrations come from the loaded `AIEngine`, so each rule is unit-tested on its own.
 *
 * @module @memberjunction/ai-agents
 */

import { ApplyPlattCalibration, type DecisionAnswer, type LikelihoodQuestion } from '@memberjunction/ai';
import type { DecisionAnsweringModel, DecisionCalibrationKey } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import type { ShadowDecisionComparison } from '@memberjunction/ai-prompts';

/** The decision use of the moderator's decision. */
export const REALTIME_MODERATOR_USE = 'realtime-turn-moderator';

/** The question every agent's Likelihood shares for calibration, whatever its key (`a1`, `a2`, …). */
export const REALTIME_MODERATOR_QUESTION = 'speaks';

/** Which calibration the moderator's Likelihoods read. */
export const REALTIME_MODERATOR_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({
    Use: REALTIME_MODERATOR_USE,
    Question: REALTIME_MODERATOR_QUESTION,
});

/**
 * The least **calibrated** probability at which an agent speaks. Provisional: no fit exists yet, and
 * a room where a wrong agent talks costs more than one where the prompt answers, so the bar sits above
 * an even chance. Revisit with the first fit's measurement.
 */
export const REALTIME_MODERATOR_MIN_PROBABILITY = 0.6;

/** One agent in the room as the decision asks about it. */
export interface ModeratorDecisionAgent {
    /** The agent's name, as the prompt names speakers and the moderator maps them to sessions. */
    readonly name: string;
    /** Other names it answers to. */
    readonly aliases?: readonly string[];
    /** What the agent does. */
    readonly role?: string;
    /** `addressed-only` agents speak only when someone addresses them. */
    readonly mode: 'proactive' | 'addressed-only';
}

/** The decision's state: the roster and the recent conversation, as the moderator prompt sees them. */
export interface ModeratorDecisionState {
    readonly agents: readonly ModeratorDecisionAgent[];
    readonly latestSpeaker: string;
    readonly latestIsAgent: boolean;
    readonly conversation: ReadonlyArray<{ speaker: string; isAgent: boolean; text: string }>;
}

/** The question key of the agent at a 0-based roster index. */
export function ModeratorQuestionKey(index: number): string {
    return `a${index + 1}`;
}

/**
 * One Likelihood per agent, keyed `a1`, `a2`, … in roster order. Each question names its agent: a
 * native decision driver may answer each question separately against the state, so a question that
 * only named a key would ask the same thing about every agent.
 *
 * @param agents The roster, in order.
 */
export function BuildModeratorQuestions(agents: readonly ModeratorDecisionAgent[]): Record<string, LikelihoodQuestion> {
    const questions: Record<string, LikelihoodQuestion> = {};
    agents.forEach((agent, i) => {
        questions[ModeratorQuestionKey(i)] = { Kind: 'Likelihood', Instructions: moderatorQuestionText(agent) };
    });
    return questions;
}

function moderatorQuestionText(agent: ModeratorDecisionAgent): string {
    const role = agent.role?.trim() ? ` (${agent.role.trim()})` : '';
    const addressedOnly = agent.mode === 'addressed-only'
        ? ' This agent speaks only when the latest turn addresses it by name or clearly directs a question at it.'
        : '';
    return `The agent ${agent.name}${role} should speak next in this conversation: the latest turn asks for or clearly benefits from its input, ` +
        `and it would add something new rather than repeat itself or continue an unproductive back-and-forth between agents.${addressedOnly}`;
}

/**
 * The speakers a decision picks, by name, ordered by calibrated probability (highest first, roster
 * order breaking ties), or null when the decision cannot pick: the answering model has no moderator
 * calibration, or an agent's answer is missing. An empty list means nobody speaks.
 *
 * @param answers The decision's answers.
 * @param agents The roster the questions were built from, in the same order.
 * @param answeredBy The model that answered.
 * @param threshold The calibrated probability at which an agent speaks.
 */
export function ModeratorSpeakersFromDecision(
    answers: Record<string, DecisionAnswer>,
    agents: readonly ModeratorDecisionAgent[],
    answeredBy: DecisionAnsweringModel,
    threshold: number = REALTIME_MODERATOR_MIN_PROBABILITY
): string[] | null {
    const calibration = AIEngine.Instance.FindDecisionCalibration(REALTIME_MODERATOR_CALIBRATION_KEY, answeredBy);
    if (!calibration) {
        return null;
    }
    const scored: Array<{ name: string; probability: number; index: number }> = [];
    for (let i = 0; i < agents.length; i++) {
        const raw = rawProbability(answers[ModeratorQuestionKey(i)]);
        if (raw === undefined) {
            return null;
        }
        scored.push({ name: agents[i].name, probability: ApplyPlattCalibration(raw, calibration), index: i });
    }
    return scored
        .filter(s => s.probability >= threshold)
        .sort((a, b) => b.probability - a.probability || a.index - b.index)
        .map(s => s.name);
}

/**
 * How the decision compares with the moderator prompt's speakers, for a shadow run. Agreement is the
 * same set of speakers; the order is recorded but not required. Each agent's label (whether the prompt
 * picked it) and raw probability go into the details, one per question, for a later fit. Without a
 * calibration the raw probabilities are compared at 0.5, which is only the agreement figure.
 *
 * @param answers The decision's answers.
 * @param promptSpeakers The names the prompt picked, in order.
 * @param agents The roster the questions were built from.
 * @param answeredBy The model that answered.
 */
export function CompareModeratorDecision(
    answers: Record<string, DecisionAnswer>,
    promptSpeakers: readonly string[],
    agents: readonly ModeratorDecisionAgent[],
    answeredBy: DecisionAnsweringModel
): ShadowDecisionComparison {
    const picked = new Set(promptSpeakers.map(normalizeName));
    const calibrated = ModeratorSpeakersFromDecision(answers, agents, answeredBy);
    const decisionSpeakers = calibrated ?? agents
        .filter((_agent, i) => (rawProbability(answers[ModeratorQuestionKey(i)]) ?? 0) >= 0.5)
        .map(a => a.name);
    const decisionSet = new Set(decisionSpeakers.map(normalizeName));
    const agreed = decisionSet.size === picked.size && [...decisionSet].every(n => picked.has(n));
    return {
        Agreed: agreed,
        Summary: `decision picked [${decisionSpeakers.join(', ')}]${calibrated ? '' : ' (uncalibrated, at 0.5)'}, prompt picked [${promptSpeakers.join(', ')}]`,
        Details: {
            Question: REALTIME_MODERATOR_QUESTION,
            Calibrated: calibrated !== null,
            PromptSpeakers: [...promptSpeakers],
            DecisionSpeakers: decisionSpeakers,
            Agents: agents.map((agent, i) => ({
                Key: ModeratorQuestionKey(i),
                Name: agent.name,
                Label: picked.has(normalizeName(agent.name)) || (agent.aliases ?? []).some(a => picked.has(normalizeName(a))),
                RawProbability: rawProbability(answers[ModeratorQuestionKey(i)]) ?? null
            }))
        }
    };
}

function normalizeName(name: string): string {
    return (name ?? '').trim().toLowerCase();
}

function rawProbability(answer: DecisionAnswer | undefined): number | undefined {
    return answer?.Kind === 'Likelihood' && typeof answer.Probability === 'number' && Number.isFinite(answer.Probability)
        ? answer.Probability
        : undefined;
}
