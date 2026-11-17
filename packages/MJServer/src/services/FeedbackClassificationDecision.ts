/**
 * @fileoverview Feedback classification asked as a decision: two Choice questions, the category and
 * a bug's severity, answered in one call.
 *
 * `ClassifyFeedback` used to ask a chat model for a JSON object. The decision asks the same thing as
 * closed-set questions, so the answer is always one of the allowed values and the call bills input
 * tokens only. The prompt's severity rules for non-bugs ("a question is trivial", "a feature is
 * minor") are not left to the model: they are applied here, in {@link SeverityForCategory}, so the
 * severity Choice only ever decides how bad a bug is.
 *
 * Choices pick the most likely option, so this use needs no calibration and defaults to `Decision`
 * (`feedbackSettings.decisionMode`). The chat-completion classifier remains the fallback when the
 * decision fails or cannot be asked.
 *
 * Kept apart from the resolver so the questions and reading rules are unit-tested on their own.
 */

import type { ChoiceQuestion, DecisionAnswer } from '@memberjunction/ai';
import type { ShadowDecisionComparison, ShadowDecisionRunner } from '@memberjunction/ai-prompts';

/** The decision use: names shadow runs and log lines. */
export const FEEDBACK_CLASSIFIER_USE = 'feedback-classifier';

let feedbackDecisionRunner: ShadowDecisionRunner | null = null;

/** Sets (or clears with `null`) the decision runner `ClassifyFeedback` uses. For tests; the default is a new `AIDecisionRunner`. */
export function SetFeedbackDecisionRunner(runner: ShadowDecisionRunner | null): void {
    feedbackDecisionRunner = runner;
}

/** The decision runner `ClassifyFeedback` uses, or undefined for the default. */
export function GetFeedbackDecisionRunner(): ShadowDecisionRunner | undefined {
    return feedbackDecisionRunner ?? undefined;
}

/** The question keys. */
export const FEEDBACK_CATEGORY_QUESTION = 'category';
export const FEEDBACK_SEVERITY_QUESTION = 'severity';

/** The categories feedback can have. */
export type FeedbackCategory = 'bug' | 'feature' | 'question' | 'other';

/** The severities feedback can have. */
export type FeedbackSeverity = 'critical' | 'major' | 'minor' | 'trivial';

/** A classification: what `ClassifyFeedback` returns on success. */
export interface FeedbackClassification {
    Category: FeedbackCategory;
    Severity: FeedbackSeverity;
}

const CATEGORIES: readonly FeedbackCategory[] = ['bug', 'feature', 'question', 'other'];
const SEVERITIES: readonly FeedbackSeverity[] = ['critical', 'major', 'minor', 'trivial'];

/** The category Choice. The descriptions carry the old prompt's rules for reading intent. */
const CATEGORY_QUESTION: ChoiceQuestion = {
    Kind: 'Choice',
    Instructions:
        'What kind of feedback is this? Read the intent, not just the keywords. Someone who cannot find ' +
        'something is asking a question, not reporting a bug, even if they sound frustrated.',
    Options: [
        {
            Value: 'question',
            Description:
                'The user is seeking help or information: "how do I", "where is", "can I", "is it possible", ' +
                '"I can\'t find", "where did ___ go", "I used to see ___ but now", "help me".'
        },
        {
            Value: 'feature',
            Description: 'The user wants something new: "it would be nice", "can you add", "I wish", "please add", "would love to see".'
        },
        {
            Value: 'bug',
            Description:
                'Something is objectively broken: an error message, a crash, a 500 error, a white screen, lost data, ' +
                'a button that does nothing when clicked, a page that stops responding. The system is malfunctioning, not just confusing.'
        },
        { Value: 'other', Description: 'Feedback that is none of the above.' }
    ]
};

/** The severity Choice, read only when the category is `bug`. */
const SEVERITY_QUESTION: ChoiceQuestion = {
    Kind: 'Choice',
    Instructions:
        'If this feedback reports a bug, how severe is it? Minor is the default: pick major only when the user ' +
        'says the problem blocks their work, and when unsure between trivial and minor, pick trivial.',
    Options: [
        { Value: 'critical', Description: 'Data loss, a security vulnerability, or the entire system unusable for all users.' },
        {
            Value: 'major',
            Description:
                'The user explicitly says it is blocking them, preventing them from doing something, or that they cannot ' +
                'complete their work or do their job.'
        },
        { Value: 'minor', Description: 'Any other functional problem. The default for a bug.' },
        {
            Value: 'trivial',
            Description: 'Purely visual: a typo, a misspelling, alignment, spacing, colors, dark mode, theme, font, styling, cosmetic appearance.'
        }
    ]
};

/** The two questions, keyed {@link FEEDBACK_CATEGORY_QUESTION} and {@link FEEDBACK_SEVERITY_QUESTION}. */
export function BuildFeedbackQuestions(): Record<string, ChoiceQuestion> {
    return { [FEEDBACK_CATEGORY_QUESTION]: CATEGORY_QUESTION, [FEEDBACK_SEVERITY_QUESTION]: SEVERITY_QUESTION };
}

/** The state the questions are asked about: the feedback's title and description. */
export function BuildFeedbackState(title: string, description: string): string {
    return `Title: ${title}\nDescription: ${description}`;
}

/**
 * The severity for a category, as the old prompt's rules fix it: a question is trivial, a feature
 * request or anything else is minor, and only a bug takes the model's severity.
 *
 * @param category The feedback's category.
 * @param bugSeverity The severity the decision chose, used only for a bug.
 */
export function SeverityForCategory(category: FeedbackCategory, bugSeverity: FeedbackSeverity): FeedbackSeverity {
    switch (category) {
        case 'question':
            return 'trivial';
        case 'bug':
            return bugSeverity;
        case 'feature':
        case 'other':
        default:
            return 'minor';
    }
}

/**
 * The classification from the decision's answers, or null when either answer is missing, not a
 * Choice, or not an allowed value, so the caller falls back to the chat-completion classifier.
 *
 * @param answers The decision's answers.
 */
export function ReadFeedbackClassification(answers: Record<string, DecisionAnswer>): FeedbackClassification | null {
    const category = readChoice(answers[FEEDBACK_CATEGORY_QUESTION], CATEGORIES);
    const severity = readChoice(answers[FEEDBACK_SEVERITY_QUESTION], SEVERITIES);
    if (!category || !severity) {
        return null;
    }
    return { Category: category, Severity: SeverityForCategory(category, severity) };
}

/** A Choice answer's value when it is one of the allowed values. */
function readChoice<T extends string>(answer: DecisionAnswer | undefined, allowed: readonly T[]): T | null {
    if (answer?.Kind !== 'Choice') {
        return null;
    }
    const value = answer.Value?.trim().toLowerCase();
    return allowed.find(a => a === value) ?? null;
}

/**
 * How the decision compares with the chat-completion classifier, for a shadow run. Agreement means
 * the same category and severity; a classifier that failed never agrees.
 *
 * @param answers The decision's answers.
 * @param existing The classifier's result: its category and severity, or null when it failed.
 */
export function CompareFeedbackClassification(
    answers: Record<string, DecisionAnswer>,
    existing: { Category?: string; Severity?: string } | null
): ShadowDecisionComparison {
    const decision = ReadFeedbackClassification(answers);
    const existingCategory = existing?.Category?.trim().toLowerCase();
    const existingSeverity = existing?.Severity?.trim().toLowerCase();
    const agreed = !!decision && decision.Category === existingCategory && decision.Severity === existingSeverity;
    const describe = (c?: string, s?: string) => (c ? `${c}/${s ?? '?'}` : 'nothing');
    return {
        Agreed: agreed,
        Summary: `decision chose ${describe(decision?.Category, decision?.Severity)}, LLM chose ${describe(existingCategory, existingSeverity)}`,
        Details: {
            Decision: decision,
            Existing: existing ? { Category: existing.Category ?? null, Severity: existing.Severity ?? null } : null
        }
    };
}
