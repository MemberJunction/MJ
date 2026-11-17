/**
 * @fileoverview The restricted-field classifier asked as a decision: one Likelihood per candidate
 * field, "does this comment discuss or reveal it?", answered in a single call.
 *
 * This is Stage 2 of {@link InspectAndStampRestrictedFieldsForComment}, the semantic check that runs
 * after the deterministic name match. The existing path is the `Anchored Comment Restricted Field
 * Classifier` prompt; this module is the decision that can replace it, through `RunDecisionUse`:
 * - `Prompt`: only the prompt answers.
 * - `Shadow` (the default): the prompt answers; the decision runs beside it and its run records
 *   whether the two flagged the same fields (`RunName = 'Shadow: restricted-field-classifier'`).
 * - `Decision`: a field is flagged when its **calibrated** probability is at or above
 *   {@link RESTRICTED_FIELD_DECISION_MIN_PROBABILITY}. An answer from a model with no calibration for
 *   this use falls back to the prompt, as a failed decision does.
 *
 * The default stays `Shadow` because no calibration has been fitted for this use yet: the shadow runs
 * are the labelled data for the fit (the `fit-decision-calibration` rig). Switch a deployment to
 * `Decision` only once a fit is in the answering model's `ModelConfiguration.Decision.Calibrations`.
 *
 * Kept apart from the classifier so the question, state and reading rules are unit-tested on their own.
 *
 * @module @memberjunction/core-entities-server
 */

import type { DecisionAnswer, LikelihoodQuestion } from '@memberjunction/ai';
import type { DecisionAnsweringModel, DecisionCalibrationKey } from '@memberjunction/ai-core-plus';
import { AIEngine } from '@memberjunction/aiengine';
import {
    ResolveDecisionUseMode,
    type AIDecisionRunResult,
    type DecisionUseMode,
    type ShadowDecisionComparison
} from '@memberjunction/ai-prompts';

/** The decision use: names shadow runs and selects the calibration. */
export const RESTRICTED_FIELD_CLASSIFIER_USE = 'restricted-field-classifier';

/** The question every field's Likelihood shares for calibration, whatever its key (`f1`, `f2`, …). */
export const RESTRICTED_FIELD_DECISION_QUESTION = 'discusses';

/** Which calibration the per-field Likelihoods read. */
export const RESTRICTED_FIELD_CALIBRATION_KEY: DecisionCalibrationKey = Object.freeze({
    Use: RESTRICTED_FIELD_CLASSIFIER_USE,
    Question: RESTRICTED_FIELD_DECISION_QUESTION
});

/**
 * The least calibrated probability at which a field is flagged in `Decision` mode.
 *
 * Deliberately low. The cost of the two errors is not symmetric: a missed field leaves a comment
 * about a restricted value readable by people the field rule hides it from, while a false flag only
 * hides one comment from them. So the threshold trades precision for recall. Revisit it with the
 * calibration fit, against the shadow runs' labelled outcomes.
 */
export const RESTRICTED_FIELD_DECISION_MIN_PROBABILITY = 0.2;

/** The mode used when nothing is configured: `Shadow`, until a calibration is fitted. */
export const RESTRICTED_FIELD_DEFAULT_DECISION_MODE: DecisionUseMode = 'Shadow';

/** The raw probability a shadow comparison reads as "the decision flagged it", since it has no calibration yet. */
export const RESTRICTED_FIELD_SHADOW_RAW_THRESHOLD = 0.5;

let restrictedFieldDecisionMode: DecisionUseMode = RESTRICTED_FIELD_DEFAULT_DECISION_MODE;

/**
 * Sets how the restricted-field classifier's semantic stage is answered. MJServer calls it at startup
 * from `decisions.restrictedFieldClassifier` in its config. A value that is not a mode (case-insensitive)
 * restores the default, `Shadow`.
 *
 * @param mode `Prompt`, `Shadow` or `Decision`.
 */
export function SetRestrictedFieldClassifierDecisionMode(mode: unknown): void {
    restrictedFieldDecisionMode = ResolveDecisionUseMode(mode, RESTRICTED_FIELD_DEFAULT_DECISION_MODE);
}

/** How the restricted-field classifier's semantic stage is answered now. */
export function GetRestrictedFieldClassifierDecisionMode(): DecisionUseMode {
    return restrictedFieldDecisionMode;
}

/** A candidate restricted field, as the decision asks about it. */
export interface RestrictedFieldDecisionCandidate {
    Name: string;
    DisplayName: string;
    Description: string | null;
}

/** What the decision is asked about: the comment, and the record type it is on. */
export interface RestrictedFieldDecisionInput {
    EntityDisplayName: string;
    MessageText: string;
    AnchorType: string | null;
    AnchorKey: string | null;
    CandidateFields: ReadonlyArray<RestrictedFieldDecisionCandidate>;
}

/** The question key of the candidate at this index: `f1`, `f2`, … */
export function RestrictedFieldQuestionKey(index: number): string {
    return `f${index + 1}`;
}

/**
 * One Likelihood per candidate field, keyed `f1`, `f2`, … in the candidates' order. Each question
 * names its field and quotes its description: a native decision driver may answer each question on
 * its own against the state, so a question that named only its key would ask the same thing about
 * every field.
 *
 * @param input The comment and its candidate fields.
 */
export function BuildRestrictedFieldQuestions(input: RestrictedFieldDecisionInput): Record<string, LikelihoodQuestion> {
    const questions: Record<string, LikelihoodQuestion> = {};
    input.CandidateFields.forEach((field, i) => {
        questions[RestrictedFieldQuestionKey(i)] = {
            Kind: 'Likelihood',
            Instructions: describeFieldQuestion(input.EntityDisplayName, field)
        };
    });
    return questions;
}

/** The statement one field's Likelihood asks about. */
function describeFieldQuestion(entityDisplayName: string, field: RestrictedFieldDecisionCandidate): string {
    const description = field.Description?.trim();
    const what = description ? `the "${field.DisplayName}" field (${description})` : `the "${field.DisplayName}" field`;
    return `This comment on a ${entityDisplayName} record discusses, asks about, or reveals the value of ${what}, ` +
        `whether it names the field or only refers to its content.`;
}

/**
 * The state the questions are asked about: the comment, the record type, and where on the record
 * it is anchored. Nothing from the record itself: the record's values never go to the model.
 *
 * @param input The comment and its candidate fields.
 */
export function BuildRestrictedFieldState(input: RestrictedFieldDecisionInput): Record<string, unknown> {
    return {
        recordType: input.EntityDisplayName,
        anchor: input.AnchorKey ? `${input.AnchorType ?? 'Section'}: ${input.AnchorKey}` : (input.AnchorType ?? 'Record'),
        comment: input.MessageText
    };
}

/** One field's answer, raw and calibrated. */
export interface RestrictedFieldDecisionVerdict {
    Name: string;
    RawProbability: number | null;
    CalibratedProbability: number | null;
}

/**
 * Each candidate's answer, raw and calibrated for the model that answered. A missing or non-Likelihood
 * answer reads as null.
 *
 * @param input The comment and its candidate fields, in the order the questions were built.
 * @param answers The decision's answers.
 * @param answeredBy The model that answered.
 */
export function ReadRestrictedFieldVerdicts(
    input: RestrictedFieldDecisionInput,
    answers: Record<string, DecisionAnswer>,
    answeredBy: DecisionAnsweringModel
): RestrictedFieldDecisionVerdict[] {
    return input.CandidateFields.map((field, i) => {
        const answer = answers[RestrictedFieldQuestionKey(i)];
        const raw = answer?.Kind === 'Likelihood' && Number.isFinite(answer.Probability) ? answer.Probability : null;
        const calibrated = raw === null ? null : AIEngine.Instance.CalibrateDecisionProbability(RESTRICTED_FIELD_CALIBRATION_KEY, raw, answeredBy);
        return { Name: field.Name, RawProbability: raw, CalibratedProbability: calibrated };
    });
}

/** The model that answered a decision run, for calibration. */
export function AnsweredByOf(run: AIDecisionRunResult): DecisionAnsweringModel {
    return { ModelName: run.modelInfo?.modelName, ResolvedModel: run.DecisionResult?.ResolvedModel };
}

/**
 * The fields the decision flags, or null when it is not good enough to act on: a field went
 * unanswered, or the model that answered has no calibration for this use. Null falls back to the
 * prompt in `Decision` mode.
 *
 * @param verdicts Each candidate's answer, from {@link ReadRestrictedFieldVerdicts}.
 */
export function FlaggedFieldsFromVerdicts(verdicts: ReadonlyArray<RestrictedFieldDecisionVerdict>): string[] | null {
    if (verdicts.some(v => v.CalibratedProbability === null)) {
        return null;
    }
    return verdicts
        .filter(v => (v.CalibratedProbability ?? 0) >= RESTRICTED_FIELD_DECISION_MIN_PROBABILITY)
        .map(v => v.Name);
}

/**
 * How the decision compares with the prompt's flagged fields, for a shadow run. The decision has no
 * calibration yet, so it counts as flagging a field at a raw {@link RESTRICTED_FIELD_SHADOW_RAW_THRESHOLD};
 * the raw and calibrated probabilities are kept in `Details` for the fit.
 *
 * @param verdicts Each candidate's answer.
 * @param promptFields The fields the prompt flagged.
 */
export function CompareRestrictedFieldDecision(
    verdicts: ReadonlyArray<RestrictedFieldDecisionVerdict>,
    promptFields: readonly string[]
): ShadowDecisionComparison {
    const promptSet = new Set(promptFields.map(f => f.toLowerCase()));
    const decisionFields = verdicts
        .filter(v => (v.RawProbability ?? 0) >= RESTRICTED_FIELD_SHADOW_RAW_THRESHOLD)
        .map(v => v.Name);
    const decisionSet = new Set(decisionFields.map(f => f.toLowerCase()));
    const agreed = decisionSet.size === promptSet.size && [...decisionSet].every(f => promptSet.has(f));
    return {
        Agreed: agreed,
        Summary: `decision flagged [${decisionFields.join(', ')}], prompt flagged [${promptFields.join(', ')}]`,
        Details: {
            PromptFields: [...promptFields],
            Fields: verdicts.map(v => ({
                Name: v.Name,
                RawProbability: v.RawProbability,
                CalibratedProbability: v.CalibratedProbability,
                PromptFlagged: promptSet.has(v.Name.toLowerCase())
            }))
        }
    };
}
