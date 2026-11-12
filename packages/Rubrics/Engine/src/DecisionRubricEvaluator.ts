import type { ScoreAnswer, ScoreQuestion } from '@memberjunction/ai';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import type { RubricNodeSnapshot, RubricVersionSnapshot } from '@memberjunction/rubrics-base';
import { RegisterClass } from '@memberjunction/global';
import { PromptRef, RenderCriteriaText, RUBRIC_CRITERION_PROMPT } from './LLMRubricEvaluator.js';
import { BaseRubricEvaluator, type RubricCandidate } from './RubricEvaluator.js';
import type { RubricSubjectContent } from './content.js';
import {
    RUBRIC_DECISION_USE,
    type RubricDecisionService, type RubricEvaluatorContext, type RubricEvaluatorRun, type RubricEvaluatorType, type RubricJsonValue, type RubricPromptRef,
} from './evaluatorServices.js';
import { LeafNodes, SubjectBody, type RubricCriterionPromptData, type RubricScalePromptData } from './promptData.js';

/** The decision prompt the Decision evaluator runs when the settings name none. Its bindings choose the model. */
export const DEFAULT_DECISION_PROMPT = 'Default Decision';

/**
 * A numeric scale with a step is asked one level per step when it has at most this many steps, so a
 * 1–5 or 0–10 scale is asked exactly.
 */
export const NUMERIC_SCORE_MAX_STEP_LEVELS = 11;

/**
 * A numeric scale with more steps than {@link NUMERIC_SCORE_MAX_STEP_LEVELS}, or with no step, is
 * asked as this many evenly spaced levels from Min to Max (each snapped to the step, when there is
 * one). The answer maps back to the scale as the probability-weighted value of those levels.
 */
export const NUMERIC_SCORE_BUCKETS = 5;

/**
 * The values a numeric scale is asked as, lowest first, or null when it cannot be asked: no Min or
 * Max, or Max not above Min. One value per step when the step divides the range into at most
 * {@link NUMERIC_SCORE_MAX_STEP_LEVELS} levels; otherwise {@link NUMERIC_SCORE_BUCKETS} evenly spaced
 * values snapped to the step.
 */
export function NumericScoreValues(scale: RubricScalePromptData | null): number[] | null {
    if (!scale || scale.Type !== 'Numeric') return null;
    const { Min: min, Max: max } = scale;
    if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    const step = scale.Step !== null && Number.isFinite(scale.Step) && scale.Step > 0 ? scale.Step : null;
    if (step !== null) {
        const steps = (max - min) / step;
        if (Math.abs(steps - Math.round(steps)) < 1e-8 && Math.round(steps) + 1 <= NUMERIC_SCORE_MAX_STEP_LEVELS) {
            return Array.from({ length: Math.round(steps) + 1 }, (_, index) => tidy(min + index * step));
        }
    }
    const values: number[] = [];
    for (let index = 0; index < NUMERIC_SCORE_BUCKETS; index++) {
        const value = SnapToScale(min + (index * (max - min)) / (NUMERIC_SCORE_BUCKETS - 1), scale);
        if (!values.some(existing => existing === value)) values.push(value);
    }
    return values.length >= 2 ? values : null;
}

/** A value clamped to the scale's Min..Max and rounded onto its step, when it has one. */
export function SnapToScale(value: number, scale: RubricScalePromptData): number {
    const min = scale.Min ?? value;
    const max = scale.Max ?? value;
    const step = scale.Step !== null && Number.isFinite(scale.Step) && scale.Step > 0 ? scale.Step : null;
    if (step === null) return tidy(Math.min(max, Math.max(min, value)));
    // Stay on a step: a Max that is not on one rounds down to the last step below it.
    const lastStep = Math.floor((max - min) / step + 1e-9);
    const index = Math.min(lastStep, Math.max(0, Math.round((value - min) / step)));
    return tidy(min + index * step);
}

/**
 * One criterion as a typed Score question: the rubric's instructions, when it has any, then the text
 * the criterion prompt rendered, and the levels lowest to highest. Each question is asked on its own,
 * so it carries the rubric instructions itself.
 *
 * A level scale is asked by its level labels. A numeric scale is asked by the values
 * {@link NumericScoreValues} picks, labelled as numbers, with a line naming the range and direction.
 * Null when the criterion cannot be asked this way: fewer than two levels, or a numeric scale with
 * no usable range.
 */
export function ScoreQuestionForCriterion(criterion: RubricCriterionPromptData, rubricInstructions?: string | null): ScoreQuestion | null {
    const text = criterion.Text ?? criterion.Name;
    const withRubric = (body: string): string => rubricInstructions?.trim() ? `${rubricInstructions.trim()}\n\n${body}` : body;
    if (criterion.Scale?.Type === 'Numeric') {
        const values = NumericScoreValues(criterion.Scale);
        if (!values) return null;
        return { Kind: 'Score', Instructions: withRubric(`${text}\n\n${NumericScaleLine(criterion.Scale)}`), Levels: values.map(NumericLabel) };
    }
    if (criterion.Scale?.Type !== 'Levels' || criterion.Levels.length < 2) return null;
    return { Kind: 'Score', Instructions: withRubric(text), Levels: criterion.Levels.map(level => level.Label) };
}

/**
 * The level a Score answer chose: the most probable level, or the level nearest Value when the
 * answer carries no probabilities. Returns that level's probability as the confidence. The
 * probability is the model's raw one; ranking on it is fine, thresholding needs a calibration.
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
 * The numeric value a Score answer places a numeric criterion at: the probability-weighted value of
 * the asked levels, or, with no probabilities, Value read as a position between them. Snapped onto
 * the scale. The confidence is the probability of the asked level nearest that value, or the
 * answer's Confidence when there are no probabilities.
 */
export function NumericValueFromAnswer(scale: RubricScalePromptData, values: number[], answer: ScoreAnswer): { value: number; confidence: number | null } {
    const weighted = values
        .map(value => ({ value, probability: answer.Probabilities?.[NumericLabel(value)] }))
        .filter((item): item is { value: number; probability: number } => typeof item.probability === 'number' && Number.isFinite(item.probability));
    const mass = weighted.reduce((total, item) => total + item.probability, 0);
    if (mass > 0) {
        const value = SnapToScale(weighted.reduce((total, item) => total + item.value * item.probability, 0) / mass, scale);
        const nearest = weighted.reduce((best, item) => Math.abs(item.value - value) < Math.abs(best.value - value) ? item : best);
        return { value, confidence: nearest.probability / mass };
    }
    const position = Math.min(values.length - 1, Math.max(0, Number.isFinite(answer.Value) ? answer.Value : 0));
    const lower = Math.floor(position);
    const upper = Math.min(values.length - 1, lower + 1);
    const value = SnapToScale(values[lower] + (values[upper] - values[lower]) * (position - lower), scale);
    return { value, confidence: Number.isFinite(answer.Confidence) ? answer.Confidence : null };
}

/** Why a criterion was not settled by the decision pass. */
export type RubricDecisionDeferral = 'EvidenceRequired' | 'NotAskable' | 'Unanswered' | 'LowConfidence';

/** One criterion the decision answered. */
export interface RubricDecisionCriterion {
    Key: string;
    /** The answer as a candidate. Its confidence is the calibrated one when Calibrated, else the raw one. */
    Candidate: RubricCandidate;
    /** The model's own probability for the chosen level (or nearest level, for a numeric scale). */
    RawConfidence: number | null;
    /** Whether a calibration for `rubric-evaluation` and this key, fitted on the model that answered, was applied. */
    Calibrated: boolean;
}

/** What one decision call settled, and what it did not. */
export interface RubricDecisionPass {
    Answered: RubricDecisionCriterion[];
    /** Leaves that were not asked: they require evidence (when not asked), or their scale cannot be a Score question. */
    NotAsked: { Key: string; Reason: Extract<RubricDecisionDeferral, 'EvidenceRequired' | 'NotAskable'> }[];
    /** Leaves that were asked but came back with no answer. */
    Unanswered: string[];
    PromptRunID: string | null;
    ModelName: string | null;
    ResolvedModel: string | null;
}

/** Everything one decision pass reads. */
export interface RubricDecisionPassInput {
    Version: RubricVersionSnapshot;
    Content: RubricSubjectContent;
    /** The leaves as template data, with Text rendered by the criterion prompt. */
    Criteria: RubricCriterionPromptData[];
    Decisions: RubricDecisionService;
    Prompt: RubricPromptRef;
    ModelID?: string;
    /** False leaves evidence-required criteria out of the call; a decision model cannot quote. */
    AskEvidenceRequired: boolean;
}

/**
 * Asks every askable leaf as a Score question in one decision call and turns the answers into
 * candidates. A level scale answers with its most probable level; a numeric scale with its
 * probability-weighted value. Each confidence is calibrated when the answering model declares a fit
 * for use `rubric-evaluation`, question = the criterion's key, on its exact resolved model
 * (`AIEngineBase.Instance.CalibrateDecisionProbability`); otherwise it is the model's raw probability.
 *
 * Throws when nothing can be asked, when the call throws, or when an answer names a level the scale
 * does not have. Leaves that were not asked or not answered are returned, never dropped silently.
 */
export async function RunRubricDecisionPass(input: RubricDecisionPassInput): Promise<RubricDecisionPass> {
    const questions: Record<string, ScoreQuestion> = {};
    const notAsked: RubricDecisionPass['NotAsked'] = [];
    for (const criterion of input.Criteria) {
        if (criterion.EvidenceRequired && !input.AskEvidenceRequired) {
            notAsked.push({ Key: criterion.Key, Reason: 'EvidenceRequired' });
            continue;
        }
        const question = ScoreQuestionForCriterion(criterion, input.Version.instructions);
        if (question) questions[criterion.Key] = question;
        else notAsked.push({ Key: criterion.Key, Reason: 'NotAskable' });
    }
    if (Object.keys(questions).length === 0) throw new Error('No criterion in this rubric can be asked as a Score question.');
    const output = await input.Decisions.Decide({ Prompt: input.Prompt, State: SubjectBody(input.Content), Questions: questions, ModelID: input.ModelID });
    const answeredBy = { ModelName: output.ModelName ?? null, ResolvedModel: output.ResolvedModel ?? null };
    const byKey = new Map(input.Criteria.map(criterion => [criterion.Key, criterion]));
    const answered: RubricDecisionCriterion[] = [];
    const unanswered: string[] = [];
    for (const leaf of LeafNodes(input.Version)) {
        const question = questions[leaf.key];
        const criterion = byKey.get(leaf.key);
        if (!question || !criterion) continue;
        const answer = output.Answers[leaf.key];
        if (!answer || answer.Kind !== 'Score') {
            unanswered.push(leaf.key);
            continue;
        }
        const chosen = CandidateFromAnswer(input.Version, leaf, criterion, question, answer);
        const calibrated = chosen.confidence === null
            ? null
            : AIEngineBase.Instance.CalibrateDecisionProbability({ Use: RUBRIC_DECISION_USE, Question: leaf.key }, chosen.confidence, answeredBy);
        const confidence = calibrated ?? chosen.confidence;
        answered.push({
            Key: leaf.key,
            RawConfidence: chosen.confidence,
            Calibrated: calibrated !== null,
            Candidate: { ...chosen.candidate, confidence, rationale: Rationale(chosen.described, confidence, calibrated !== null) },
        });
    }
    return { Answered: answered, NotAsked: notAsked, Unanswered: unanswered, PromptRunID: output.PromptRunID ?? null, ...answeredBy };
}

/** The candidate one answer gives a leaf, before calibration, and how to describe what it chose. */
function CandidateFromAnswer(
    version: RubricVersionSnapshot, leaf: RubricNodeSnapshot, criterion: RubricCriterionPromptData, question: ScoreQuestion, answer: ScoreAnswer,
): { candidate: RubricCandidate; confidence: number | null; described: string } {
    if (criterion.Scale?.Type === 'Numeric') {
        const values = NumericScoreValues(criterion.Scale) ?? [];
        const placed = NumericValueFromAnswer(criterion.Scale, values, answer);
        return {
            candidate: { criterionId: leaf.id, rawValue: placed.value, rationale: '', evidence: [] },
            confidence: placed.confidence,
            described: `placed it at ${NumericLabel(placed.value)}`,
        };
    }
    const chosen = ChosenLevel(question, answer);
    const level = version.scales.find(scale => scale.id === leaf.scaleId)?.levels.find(item => item.label === chosen.label);
    if (!level) throw new Error(`Unknown level "${chosen.label}" for ${leaf.key}.`);
    return {
        candidate: { criterionId: leaf.id, scaleLevelId: level.id, rationale: '', evidence: [] },
        confidence: chosen.confidence,
        described: `chose ${chosen.label}`,
    };
}

function Rationale(described: string, confidence: number | null, calibrated: boolean): string {
    if (confidence === null) return `Decision model ${described}.`;
    return `Decision model ${described} with ${calibrated ? 'calibrated ' : ''}probability ${confidence.toFixed(2)}.`;
}

/** The decision-pass fields an evaluator records in its run metadata. */
export function DecisionPassMetadata(pass: RubricDecisionPass): Record<string, RubricJsonValue> {
    const metadata: Record<string, RubricJsonValue> = {
        CalibratedCriteria: pass.Answered.filter(item => item.Calibrated).map(item => item.Key),
    };
    if (pass.ModelName) metadata.DecisionModel = pass.ModelName;
    if (pass.ResolvedModel) metadata.ResolvedModel = pass.ResolvedModel;
    return metadata;
}

/**
 * Scores a rubric with a Decision-type model, such as Jev, Gemini Decision, or LLM Decision for a
 * chat model run as a decision. Every leaf with a level scale or a bounded numeric scale becomes a
 * typed Score question, and all of them go in one call. Numeric scales are asked as the values
 * {@link NumericScoreValues} picks and mapped back to the scale (see that function).
 *
 * Each question's instructions are the criterion as the criterion prompt (`Rubric Criterion`, or
 * CriterionPromptID / CriterionPromptName) renders it, the same text the LLM evaluator shows. The
 * decision prompt is the settings' PromptID or PromptName, else Default Decision, and its model
 * bindings choose the model. ModelID pins one.
 *
 * Confidences are the model's raw probabilities unless the answering model declares a fit for use
 * `rubric-evaluation`, question = the criterion's key, on its exact resolved model; then they are
 * calibrated. Run metadata lists the calibrated criteria.
 *
 * A decision model returns no rationale and no quotes. Each answer's rationale states the chosen
 * level and its probability. A leaf that requires evidence is refused before any call, because the
 * submit would reject it: use DecisionThenLLM for such a rubric, which sends those leaves to the LLM.
 * A leaf whose scale cannot be asked (a numeric scale with no Min or Max) is left unanswered and
 * listed in the run metadata as UnaskedCriteria, so the evaluation records it as not evaluated.
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
        const prompts = context.Services.Prompts;
        if (!prompts) throw new Error('A Decision evaluation requires a prompt service to render its criteria.');
        const needsEvidence = LeafNodes(context.Version).filter(node => node.evidenceRequired);
        if (needsEvidence.length > 0) {
            throw new Error(`A decision model returns no evidence, and ${needsEvidence.map(node => node.key).join(', ')} require it. Use the DecisionThenLLM or LLM evaluator for this rubric.`);
        }
        const criterionPrompt = PromptRef(context.Settings.CriterionPromptID, context.Settings.CriterionPromptName, RUBRIC_CRITERION_PROMPT);
        const criteria = await RenderCriteriaText(context.Version, prompts, criterionPrompt);
        const prompt = PromptRef(context.Settings.PromptID, context.Settings.PromptName, DEFAULT_DECISION_PROMPT);
        const pass = await RunRubricDecisionPass({
            Version: context.Version, Content: context.Content, Criteria: criteria, Decisions: decisions, Prompt: prompt,
            ModelID: context.Settings.ModelID, AskEvidenceRequired: true,
        });
        if (pass.Unanswered.length > 0) throw new Error(`The decision model did not answer ${pass.Unanswered.join(', ')}.`);
        const metadata: Record<string, RubricJsonValue> = {
            Prompt: prompt.ID ?? prompt.Name ?? null,
            CriterionPrompt: criterionPrompt.ID ?? criterionPrompt.Name ?? null,
            UnaskedCriteria: pass.NotAsked.map(item => item.Key),
            ...DecisionPassMetadata(pass),
        };
        if (context.Settings.ModelID) metadata.ModelID = context.Settings.ModelID;
        return { ...this.Evaluate(context.Version, pass.Answered.map(item => item.Candidate)), aiPromptRunId: pass.PromptRunID, metadata };
    }
}

/** A numeric level's label: the value, without float noise. */
export function NumericLabel(value: number): string {
    return String(tidy(value));
}

function NumericScaleLine(scale: RubricScalePromptData): string {
    const step = scale.Step !== null && scale.Step > 0 ? ` in steps of ${NumericLabel(scale.Step)}` : '';
    return `Score it from ${NumericLabel(scale.Min ?? 0)} to ${NumericLabel(scale.Max ?? 0)}${step}; ${scale.HigherIsBetter ? 'higher' : 'lower'} is better. The levels are values on that scale.`;
}

function tidy(value: number): number {
    return Number(value.toFixed(10));
}
