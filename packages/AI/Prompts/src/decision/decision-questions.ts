import type { ChoiceOption, DecisionQuestion } from "@memberjunction/ai";

/**
 * The result of {@link ParseDecisionQuestions}: the validated question map, or the reason it is invalid.
 */
export type DecisionQuestionsParseResult =
    | { Valid: true; Questions: Record<string, DecisionQuestion>; Message?: never }
    | { Valid: false; Questions?: never; Message: string };

type QuestionsValidationResult =
    | { valid: true; questions: Record<string, DecisionQuestion>; message?: never }
    | { valid: false; questions?: never; message: string };

type QuestionValidationResult =
    | { valid: true; question: DecisionQuestion; message?: never }
    | { valid: false; question?: never; message: string };

/**
 * Parses and validates a typed decision question map, the shape `AIDecisionParams.Questions` takes: an
 * object, or its JSON text, whose keys name the questions and whose values are Likelihood, Choice or
 * Score questions. Every question needs string `Instructions`; a Choice needs an `Options` array of
 * `{ Value, Description }` strings, and a Score a `Levels` array of strings. Members the question kind
 * does not define are dropped.
 *
 * The `Run Decision` action and the `RunDecision` GraphQL mutation both validate with it, so they
 * accept the same input and report the same errors.
 *
 * @param rawQuestions The question map, or its JSON text.
 * @returns The validated questions, or a message naming the first problem found.
 */
export function ParseDecisionQuestions(rawQuestions: unknown): DecisionQuestionsParseResult {
    const result = parseAndValidateQuestions(rawQuestions);
    return result.valid
        ? { Valid: true, Questions: result.questions }
        : { Valid: false, Message: result.message };
}

function parseAndValidateQuestions(rawQuestions: unknown): QuestionsValidationResult {
    if (rawQuestions === undefined || rawQuestions === null) {
        return { valid: false, message: "Questions parameter is required" };
    }

    let parsed: unknown = rawQuestions;
    if (typeof rawQuestions === "string") {
        const trimmed = rawQuestions.trim();
        if (trimmed.length === 0) {
            return { valid: false, message: "Questions string cannot be empty" };
        }
        try {
            parsed = JSON.parse(trimmed);
        } catch (err) {
            return {
                valid: false,
                message: `Questions JSON parsing failed: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }

    if (!isObject(parsed)) {
        return { valid: false, message: "Questions must be an object" };
    }

    const entries = Object.entries(parsed);
    if (entries.length === 0) {
        return { valid: false, message: "Questions object must have at least one question" };
    }

    const questions: Record<string, DecisionQuestion> = {};
    for (const [key, q] of entries) {
        if (!key || typeof key !== "string" || key.trim().length === 0) {
            return { valid: false, message: "Question keys must be non-empty strings" };
        }
        const qValidation = validateQuestion(key, q);
        if (!qValidation.valid) {
            return { valid: false, message: qValidation.message };
        }
        questions[key] = qValidation.question;
    }

    return { valid: true, questions };
}

function validateQuestion(key: string, q: unknown): QuestionValidationResult {
    if (!isObject(q)) {
        return { valid: false, message: `Question '${key}' must be an object` };
    }

    const kind = q["Kind"];
    if (kind !== "Likelihood" && kind !== "Choice" && kind !== "Score") {
        return { valid: false, message: `Question '${key}' must have a known Kind ('Likelihood', 'Choice', or 'Score')` };
    }

    const instructions = q["Instructions"];
    if (typeof instructions !== "string" || instructions.trim().length === 0) {
        return { valid: false, message: `Question '${key}' must have string Instructions` };
    }

    if (kind === "Likelihood") {
        return {
            valid: true,
            question: {
                Kind: "Likelihood",
                Instructions: instructions,
            },
        };
    }

    if (kind === "Choice") {
        const options = validateChoiceOptions(q["Options"]);
        if (typeof options === "string") {
            return { valid: false, message: `Question '${key}' ${options}` };
        }
        return { valid: true, question: { Kind: "Choice", Instructions: instructions, Options: options } };
    }

    const levels = q["Levels"];
    if (!Array.isArray(levels)) {
        return { valid: false, message: `Question '${key}' of Kind 'Score' must have a Levels array` };
    }
    for (const lvl of levels) {
        if (typeof lvl !== "string") {
            return { valid: false, message: `Question '${key}' Levels must be an array of strings` };
        }
    }
    return {
        valid: true,
        question: {
            Kind: "Score",
            Instructions: instructions,
            Levels: [...levels],
        },
    };
}

/** Returns the validated options, or the reason they are invalid. */
function validateChoiceOptions(options: unknown): ChoiceOption[] | string {
    if (!Array.isArray(options)) {
        return "of Kind 'Choice' must have an Options array";
    }
    const validated: ChoiceOption[] = [];
    for (const opt of options) {
        if (!isObject(opt) || typeof opt["Value"] !== "string" || typeof opt["Description"] !== "string") {
            return "Options must contain objects with string Value and Description";
        }
        validated.push({ Value: opt["Value"], Description: opt["Description"] });
    }
    return validated;
}

function isObject(val: unknown): val is Record<string, unknown> {
    return typeof val === "object" && val !== null && !Array.isArray(val);
}
