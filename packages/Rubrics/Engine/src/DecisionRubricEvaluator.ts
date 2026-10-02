import type { ScoreAnswer, ScoreQuestion } from '@memberjunction/ai';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RegisterClass } from '@memberjunction/global';
import { RenderCriterion, SubjectBody } from './LLMRubricEvaluator.js';
import { BaseRubricEvaluator, type RubricCandidate } from './RubricEvaluator.js';
import type { RubricEvaluatorContext, RubricEvaluatorRun, RubricEvaluatorType, RubricJsonValue, RubricPromptRef } from './evaluatorServices.js';

/** The decision prompt the Decision evaluator runs when the settings name none. Its bindings choose the model. */
export const DEFAULT_DECISION_PROMPT = 'Default Decision';

/**
 * One criterion as a typed Score question: its rendered guidance and anchors, and its level labels
 * ordered lowest to highest. Null when the criterion cannot be asked this way: a numeric scale, or
 * fewer than two levels.
 */
export function ScoreQuestionForCriterion(version: RubricVersionSnapshot, node: RubricNodeSnapshot): ScoreQuestion | null {
    const scale = version.scales.find(item => item.id === node.scaleId);
    if (!scale || scale.scaleType !== 'Levels') return null;
    const levels = [...scale.levels].sort((left, right) => left.normalizedValue - right.normalizedValue || left.sequence - right.sequence);
    if (levels.length < 2) return null;
    const instructions = [version.instructions ?? '', RenderCriterion(version, node)].filter(part => part.length > 0).join('\n\n');
    return { Kind: 'Score', Instructions: instructions, Levels: levels.map(level => level.label) };
}

/**
 * The level a Score answer chose: the most probable level, or the level nearest Value when the
 * answer carries no probabilities. Returns that level's probability as the confidence.
 */
export function ChosenLevel(question: ScoreQuestion, answer: ScoreAnswer): { label: string; confidence: number | null } {
    const ranked = question.Levels
        .map(label => ({ label, probability: answer.Probabilities?.[label] }))
        .filter((item): item is { label: string; probability: number } => typeof item.probability === 'number' && Number.isFinite(item.probability))
        .sort((left, right) => right.probability - left.probability);
    if (ranked.length > 0) return { label: ranked[0].label, confidence: ranked[0].probability };
    const index = Math.min(question.Levels.length - 1, Math.max(0, Math.round(answer.Value)));
    return { label: question.Levels[index], confidence: Number.isFinite(answer.Confidence) ? answer.Confidence : null };
}

/**
 * Scores a rubric with a Decision-type model, such as Jev, or LLM Decision for a chat model run as a
 * decision. Every leaf with a level scale becomes a typed Score question, and all of them go in one
 * call, so the model answers with a calibrated probability per level instead of free text.
 *
 * The prompt is the settings' PromptID or PromptName, else Default Decision, and its model
 * bindings choose the model. ModelID pins one.
 *
 * A decision model returns no rationale and no quotes. Each answer's rationale states the chosen
 * level and its probability. A leaf that requires evidence is refused before any call, because the
 * submit would reject it. A leaf with a numeric scale cannot be asked as a Score question; it is
 * left unanswered and listed in the run metadata as UnaskedCriteria.
 */
@RegisterClass(BaseRubricEvaluator, 'Decision')
export class DecisionRubricEvaluator extends BaseRubricEvaluator {
    public get EvaluatorName(): string {
        return 'Decision';
    }

    public get EvaluatorType(): RubricEvaluatorType {
        return 'AIPrompt';
    }

    public async EvaluateRubric(context: RubricEvaluatorContext): Promise<RubricEvaluatorRun> {
        const decisions = context.Services.Decisions;
        if (!decisions) throw new Error('A Decision evaluation requires a decision service.');
        const leaves = context.Version.nodes.filter(node => node.nodeType === 'Criterion');
        const needsEvidence = leaves.filter(node => node.evidenceRequired);
        if (needsEvidence.length > 0) {
            throw new Error(`A decision model returns no evidence, and ${needsEvidence.map(node => node.key).join(', ')} require it. Use the LLM evaluator for this rubric.`);
        }
        const questions: Record<string, ScoreQuestion> = {};
        const unasked: string[] = [];
        for (const leaf of leaves) {
            const question = ScoreQuestionForCriterion(context.Version, leaf);
            if (question) questions[leaf.key] = question;
            else unasked.push(leaf.key);
        }
        if (Object.keys(questions).length === 0) throw new Error('No criterion in this rubric can be asked as a Score question.');
        const prompt: RubricPromptRef = context.Settings.PromptID
            ? { ID: context.Settings.PromptID }
            : { Name: context.Settings.PromptName ?? DEFAULT_DECISION_PROMPT };
        const output = await decisions.Decide({
            Prompt: prompt,
            State: SubjectBody(context.Content),
            Questions: questions,
            ModelID: context.Settings.ModelID,
        });
        const candidates = this.candidates(context.Version, leaves, questions, output.Answers);
        const metadata: Record<string, RubricJsonValue> = {
            Prompt: prompt.ID ?? prompt.Name ?? null,
            UnaskedCriteria: unasked,
        };
        if (context.Settings.ModelID) metadata.ModelID = context.Settings.ModelID;
        return { ...this.Evaluate(context.Version, candidates), aiPromptRunId: output.PromptRunID ?? null, metadata };
    }

    /** One candidate per answered leaf. A leaf the model did not answer is refused, so a partial call never scores. */
    private candidates(version: RubricVersionSnapshot, leaves: RubricNodeSnapshot[], questions: Record<string, ScoreQuestion>, answers: Record<string, ScoreAnswer>): RubricCandidate[] {
        const candidates: RubricCandidate[] = [];
        for (const leaf of leaves) {
            const question = questions[leaf.key];
            if (!question) continue;
            const answer = answers[leaf.key];
            if (!answer || answer.Kind !== 'Score') throw new Error(`The decision model did not answer ${leaf.key}.`);
            const chosen = ChosenLevel(question, answer);
            const level = version.scales.find(scale => scale.id === leaf.scaleId)?.levels.find(item => item.label === chosen.label);
            if (!level) throw new Error(`Unknown level "${chosen.label}" for ${leaf.key}.`);
            candidates.push({
                criterionId: leaf.id,
                scaleLevelId: level.id,
                rationale: chosen.confidence === null
                    ? `Decision model chose ${chosen.label}.`
                    : `Decision model chose ${chosen.label} with probability ${chosen.confidence.toFixed(2)}.`,
                evidence: [],
                confidence: chosen.confidence,
            });
        }
        return candidates;
    }
}
