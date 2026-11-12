/**
 * @fileoverview Smart Field Identification asked as a decision: the closed-set half of the
 * `CodeGen: Smart Field Identification` prompt's job, answered in one call.
 *
 * The questions:
 * - `name`: a Choice over the text fields that could name a record. The options ranked by
 *   probability become `nameFields`. No threshold: the ranking is the answer.
 * - `view_<n>`: per field, a Likelihood that it belongs in the default list view.
 * - `search_<n>`: per text field, a Likelihood that users look records up by it.
 * - `allowSearch`: a Likelihood that users search this entity at all.
 *
 * A Likelihood is acted on only once calibrated for the answering model
 * (`ModelConfiguration.Decision.Calibrations`, `Use: 'codegen-smart-fields'`, `Question: 'view' |
 * 'search' | 'allowSearch'`); with any one uncalibrated the whole answer reads as unsure, and
 * `Decision` mode runs the prompt instead. The decision leaves the search predicates and full-text
 * settings unset, which CodeGen's apply step reads as "no change".
 *
 * The mode is `advancedGeneration.smartFieldDecisionMode` (default `Prompt`). Kept free of the
 * database so the questions and reading rules are unit-tested on their own.
 *
 * @module @memberjunction/codegen-lib
 */

import type { ChoiceOption, ChoiceQuestion, DecisionAnswer, DecisionQuestion, LikelihoodQuestion } from '@memberjunction/ai';
import {
    CalibrateDecisionProbability,
    type DecisionAnsweringModel,
    type DecisionCalibrationSource,
} from '@memberjunction/ai-core-plus';
import type { ShadowDecisionComparison } from '@memberjunction/ai-prompts';
import type { SmartFieldIdentificationResult } from './advanced_generation';

/** The decision use: names shadow runs and selects the calibrations. */
export const SMART_FIELD_DECISION_USE = 'codegen-smart-fields';

/** The calibration `Question` each kind of question reads. */
export const SMART_FIELD_DECISION_QUESTIONS = Object.freeze({
    View: 'view',
    Search: 'search',
    AllowSearch: 'allowSearch',
} as const);

/** The calibrated probability at or above which a field is in the view, searchable, or the entity searchable. */
export const SMART_FIELD_DECISION_MIN_PROBABILITY = 0.5;

/** How many name candidates are kept, best first. Only the first is applied; the rest are fallbacks. */
export const SMART_FIELD_MAX_NAME_CANDIDATES = 3;

/** The least share of the `name` Choice a fallback candidate needs to be kept. */
export const SMART_FIELD_MIN_NAME_FALLBACK_PROBABILITY = 0.15;

/** The raw probability a shadow comparison reads as "yes", since the uses may have no calibration yet. */
export const SMART_FIELD_SHADOW_RAW_THRESHOLD = 0.5;

/** A field, as CodeGen's metadata query returns it. Only what the decision reads. */
export interface SmartFieldDecisionField {
    Name: string;
    Type?: string | null;
    Description?: string | null;
    IsPrimaryKey?: boolean | null;
    EntityIDFieldName?: string | null;
    RelatedEntityID?: string | null;
    RelatedEntity?: string | null;
}

/** The entity the decision is asked about. */
export interface SmartFieldDecisionEntity {
    Name: string;
    Description?: string | null;
    Fields: ReadonlyArray<SmartFieldDecisionField>;
}

/** Whether a field holds text a person could read or search by. */
function isTextField(field: SmartFieldDecisionField): boolean {
    const type = (field.Type ?? '').toLowerCase();
    return type.includes('char') || type.includes('text') || type === 'string';
}

/** Whether a field is a key: the primary key or a foreign key. */
function isKeyField(field: SmartFieldDecisionField): boolean {
    return field.IsPrimaryKey === true || Boolean(field.EntityIDFieldName) || Boolean(field.RelatedEntityID);
}

/** Whether a field is a system column (`__mj_CreatedAt`, …). */
function isSystemField(field: SmartFieldDecisionField): boolean {
    return field.Name.startsWith('__mj_');
}

/** The fields that could name a record: text, not a key, not a system column. */
export function NameFieldCandidates(entity: SmartFieldDecisionEntity): SmartFieldDecisionField[] {
    return entity.Fields.filter(f => isTextField(f) && !isKeyField(f) && !isSystemField(f));
}

/** The fields asked about for the default view: everything but the primary key and system columns. */
export function ViewFieldCandidates(entity: SmartFieldDecisionEntity): SmartFieldDecisionField[] {
    return entity.Fields.filter(f => f.IsPrimaryKey !== true && !isSystemField(f));
}

/** The fields asked about for search: the text fields that are not keys or system columns. */
export function SearchFieldCandidates(entity: SmartFieldDecisionEntity): SmartFieldDecisionField[] {
    return NameFieldCandidates(entity);
}

/** A field as the model reads it: its name, type and description. */
function describeField(field: SmartFieldDecisionField): string {
    const description = field.Description?.trim();
    const related = field.RelatedEntity ? `, a reference to ${field.RelatedEntity}` : '';
    return `"${field.Name}" (${field.Type ?? 'unknown type'}${related})${description ? `: ${description}` : ''}`;
}

/**
 * The questions, keyed `name`, `view_1`…, `search_1`…, `allowSearch`. Each Likelihood names its
 * field, since a native decision driver may read a question apart from the state.
 *
 * @param entity The entity and its fields.
 */
export function BuildSmartFieldQuestions(entity: SmartFieldDecisionEntity): Record<string, DecisionQuestion> {
    const questions: Record<string, DecisionQuestion> = {};
    const names = NameFieldCandidates(entity);
    if (names.length >= 2) {
        const options: ChoiceOption[] = names.map(f => ({ Value: f.Name, Description: describeField(f) }));
        const name: ChoiceQuestion = {
            Kind: 'Choice',
            Instructions: `The field that best names one ${entity.Name} record for a person: what a list, a dropdown or a link would show.`,
            Options: options,
        };
        questions['name'] = name;
    }
    ViewFieldCandidates(entity).forEach((f, i) => {
        questions[`view_${i + 1}`] = likelihood(`The ${entity.Name} field ${describeField(f)} belongs in the default list view of ${entity.Name} records.`);
    });
    SearchFieldCandidates(entity).forEach((f, i) => {
        questions[`search_${i + 1}`] = likelihood(`Users look up ${entity.Name} records by the field ${describeField(f)}.`);
    });
    questions['allowSearch'] = likelihood(`Users search for ${entity.Name} records by name or text, rather than reaching them only through other records.`);
    return questions;
}

function likelihood(instructions: string): LikelihoodQuestion {
    return { Kind: 'Likelihood', Instructions: instructions };
}

/**
 * The state: the entity, its description and its fields. Field metadata only, never data.
 *
 * @param entity The entity and its fields.
 */
export function BuildSmartFieldState(entity: SmartFieldDecisionEntity): Record<string, unknown> {
    return {
        entity: entity.Name,
        description: entity.Description ?? '',
        fields: entity.Fields.map(f => ({
            name: f.Name,
            type: f.Type ?? null,
            primaryKey: f.IsPrimaryKey === true,
            references: f.RelatedEntity ?? null,
            description: f.Description ?? null,
        })),
    };
}

/** Every answer, raw and calibrated. */
export interface SmartFieldDecisionVerdict {
    /** Name candidates, best first, with their share of the `name` Choice. */
    NameRanking: Array<{ Field: string; Probability: number }>;
    View: Array<{ Field: string; Raw: number | null; Calibrated: number | null }>;
    Search: Array<{ Field: string; Raw: number | null; Calibrated: number | null }>;
    AllowSearch: { Raw: number | null; Calibrated: number | null };
}

/**
 * Reads the answers, calibrating each Likelihood for the model that answered.
 *
 * @param entity The entity, as the questions were built.
 * @param answers The decision's answers.
 * @param answeredBy The model that answered.
 * @param source Where the calibrations are declared, normally `AIEngine.Instance`.
 */
export function ReadSmartFieldVerdict(
    entity: SmartFieldDecisionEntity,
    answers: Record<string, DecisionAnswer>,
    answeredBy: DecisionAnsweringModel,
    source: DecisionCalibrationSource | null | undefined
): SmartFieldDecisionVerdict {
    const read = (key: string, question: string) => {
        const answer = answers[key];
        const raw = answer?.Kind === 'Likelihood' && Number.isFinite(answer.Probability) ? answer.Probability : null;
        const calibrated = raw === null ? null : CalibrateDecisionProbability(source, { Use: SMART_FIELD_DECISION_USE, Question: question }, raw, answeredBy);
        return { Raw: raw, Calibrated: calibrated };
    };
    return {
        NameRanking: readNameRanking(entity, answers['name']),
        View: ViewFieldCandidates(entity).map((f, i) => ({ Field: f.Name, ...read(`view_${i + 1}`, SMART_FIELD_DECISION_QUESTIONS.View) })),
        Search: SearchFieldCandidates(entity).map((f, i) => ({ Field: f.Name, ...read(`search_${i + 1}`, SMART_FIELD_DECISION_QUESTIONS.Search) })),
        AllowSearch: read('allowSearch', SMART_FIELD_DECISION_QUESTIONS.AllowSearch),
    };
}

/** The name candidates by their share of the Choice, best first; the only candidate when there is one. */
function readNameRanking(entity: SmartFieldDecisionEntity, answer: DecisionAnswer | undefined): Array<{ Field: string; Probability: number }> {
    const candidates = NameFieldCandidates(entity);
    if (candidates.length === 1) {
        return [{ Field: candidates[0].Name, Probability: 1 }];
    }
    if (answer?.Kind !== 'Choice') {
        return [];
    }
    return candidates
        .map(f => ({ Field: f.Name, Probability: answer.Probabilities[f.Name] ?? 0 }))
        .filter(c => Number.isFinite(c.Probability))
        .sort((a, b) => b.Probability - a.Probability);
}

/**
 * The prompt-shaped result, or null when the answer is not good enough to act on: an entity with
 * name candidates but no ranking, or any Likelihood unanswered or uncalibrated. Null runs the prompt
 * in `Decision` mode.
 *
 * @param verdict The decision's answers, from {@link ReadSmartFieldVerdict}.
 */
export function SmartFieldResultFromVerdict(
    entity: SmartFieldDecisionEntity,
    verdict: SmartFieldDecisionVerdict
): SmartFieldIdentificationResult | null {
    const likelihoods = [...verdict.View, ...verdict.Search, verdict.AllowSearch];
    if (likelihoods.some(l => l.Calibrated === null)) {
        return null;
    }
    if (NameFieldCandidates(entity).length > 0 && verdict.NameRanking.length === 0) {
        return null;
    }
    const top = verdict.NameRanking[0]?.Probability ?? 0;
    const nameFields = verdict.NameRanking
        .filter((c, i) => i === 0 || c.Probability >= SMART_FIELD_MIN_NAME_FALLBACK_PROBABILITY)
        .slice(0, SMART_FIELD_MAX_NAME_CANDIDATES)
        .map(c => c.Field);
    const yes = (p: number | null) => p !== null && p >= SMART_FIELD_DECISION_MIN_PROBABILITY;
    return {
        nameFields,
        nameFieldsReason: `Decision model: the most likely name field (share ${top.toFixed(2)})`,
        defaultInView: verdict.View.filter(v => yes(v.Calibrated)).map(v => v.Field),
        defaultInViewReason: 'Decision model: fields with a calibrated probability of at least 0.5 of belonging in the list view',
        searchableFields: verdict.Search.filter(v => yes(v.Calibrated)).map(v => v.Field),
        searchableFieldsReason: 'Decision model: text fields users look records up by, at a calibrated probability of at least 0.5',
        allowUserSearch: yes(verdict.AllowSearch.Calibrated),
        allowUserSearchReason: `Decision model: calibrated probability ${(verdict.AllowSearch.Calibrated ?? 0).toFixed(2)}`,
        searchPredicates: [],
        fullTextSearchFields: [],
        confidence: top >= 0.8 ? 'high' : top >= 0.5 ? 'medium' : 'low',
    };
}

/**
 * How the decision compares with the prompt's result, for a shadow run: agreed when it picks the
 * same name field and the same view and searchable fields, each Likelihood read at a raw
 * {@link SMART_FIELD_SHADOW_RAW_THRESHOLD}. `Details` keeps each field's raw and calibrated answer
 * beside the prompt's, which is the labelled data the calibration fit reads.
 *
 * @param verdict The decision's answers.
 * @param existing The prompt's result, or null when it failed.
 */
export function CompareSmartFieldDecision(
    verdict: SmartFieldDecisionVerdict,
    existing: SmartFieldIdentificationResult | null
): ShadowDecisionComparison {
    const decided = (rows: SmartFieldDecisionVerdict['View']) =>
        rows.filter(r => r.Raw !== null && r.Raw >= SMART_FIELD_SHADOW_RAW_THRESHOLD).map(r => r.Field);
    const nameField = verdict.NameRanking[0]?.Field ?? null;
    const view = decided(verdict.View);
    const search = decided(verdict.Search);
    if (!existing) {
        return { Agreed: false, Summary: 'the prompt gave no result to compare', Details: { NameField: nameField, DefaultInView: view, Searchable: search } };
    }
    const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.some(y => y.toLowerCase() === x.toLowerCase()));
    const nameAgreed = (existing.nameFields[0] ?? null)?.toLowerCase() === nameField?.toLowerCase();
    const viewAgreed = sameSet(view, existing.defaultInView);
    const searchAgreed = sameSet(search, existing.searchableFields);
    return {
        Agreed: nameAgreed && viewAgreed && searchAgreed,
        Summary: `name ${nameAgreed ? 'agreed' : `differed (${nameField} vs ${existing.nameFields[0] ?? 'none'})`}, ` +
            `view ${viewAgreed ? 'agreed' : 'differed'}, search ${searchAgreed ? 'agreed' : 'differed'}`,
        Details: {
            Name: { Decision: nameField, Prompt: existing.nameFields[0] ?? null, Ranking: verdict.NameRanking },
            View: verdict.View.map(v => ({ ...v, Prompt: existing.defaultInView.some(f => f.toLowerCase() === v.Field.toLowerCase()) })),
            Search: verdict.Search.map(v => ({ ...v, Prompt: existing.searchableFields.some(f => f.toLowerCase() === v.Field.toLowerCase()) })),
            AllowSearch: { ...verdict.AllowSearch, Prompt: existing.allowUserSearch ?? null },
        },
    };
}
