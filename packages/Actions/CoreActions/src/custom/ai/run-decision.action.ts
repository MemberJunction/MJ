import { ActionResultSimple, RunActionParams } from "@memberjunction/actions-base";
import { RegisterClass } from "@memberjunction/global";
import { BaseAction } from "@memberjunction/actions";
import { UserInfo } from "@memberjunction/core";
import { AIEngine } from "@memberjunction/aiengine";
import { MJAIPromptEntityExtended } from "@memberjunction/ai-core-plus";
import { AIDecisionRunner, AIDecisionParams, AIDecisionRunResult } from "@memberjunction/ai-prompts";
import { DecisionQuestion, DecisionAnswer } from "@memberjunction/ai";

/**
 * Result codes produced by RunDecisionAction.
 */
export const RunDecisionResultCodes = {
    SUCCESS: "SUCCESS",
    MISSING_STATE: "MISSING_STATE",
    INVALID_QUESTIONS: "INVALID_QUESTIONS",
    PROMPT_NOT_FOUND: "PROMPT_NOT_FOUND",
    PROMPT_NOT_ACTIVE: "PROMPT_NOT_ACTIVE",
    DECISION_FAILED: "DECISION_FAILED",
    EXECUTION_ERROR: "EXECUTION_ERROR",
} as const;

export type RunDecisionResultCode = typeof RunDecisionResultCodes[keyof typeof RunDecisionResultCodes];

type StateValidationResult =
    | { valid: true; state: string | Record<string, unknown>; message?: never }
    | { valid: false; state?: never; message: string };

type QuestionsValidationResult =
    | { valid: true; questions: Record<string, DecisionQuestion>; message?: never }
    | { valid: false; questions?: never; message: string };

/** The validated inputs of one run, or the failure to return instead. */
type InputsResult =
    | { state: string | Record<string, unknown>; questions: Record<string, DecisionQuestion>; promptName: string }
    | { failure: ActionResultSimple };

type QuestionValidationResult =
    | { valid: true; question: DecisionQuestion; message?: never }
    | { valid: false; question?: never; message: string };

/**
 * Action that exposes typed decision execution to AI agents, flows, and low-code workflows.
 * Wraps AIDecisionRunner to evaluate Likelihood, Choice, and Score questions against state.
 */
@RegisterClass(BaseAction, "Run Decision")
export class RunDecisionAction extends BaseAction {
    private static readonly DEFAULT_PROMPT_NAME = "Default Decision";

    /**
     * Executes a typed decision operation.
     *
     * Input params:
     * - State (required): Text or a JSON object describing the state to evaluate.
     * - Questions (required): Object or JSON string mapping question keys to typed question definitions.
     * - DecisionPromptName (optional): Name of the AI Prompt entity to use, defaults to 'Default Decision'.
     */
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        try {
            const inputs = this.readInputs(params);
            if ('failure' in inputs) {
                return inputs.failure;
            }
            const prompt = await this.loadPrompt(inputs.promptName, params.ContextUser);
            if (!prompt) {
                return this.failure(RunDecisionResultCodes.PROMPT_NOT_FOUND, `AI Prompt '${inputs.promptName}' not found`);
            }
            if (prompt.Status !== "Active") {
                return this.failure(RunDecisionResultCodes.PROMPT_NOT_ACTIVE, `AI Prompt '${inputs.promptName}' is not active (status: ${prompt.Status})`);
            }
            const result = await new AIDecisionRunner().ExecuteDecision(this.buildDecisionParams(params, prompt, inputs.state, inputs.questions));
            if (!result.success) {
                return this.failure(RunDecisionResultCodes.DECISION_FAILED, result.errorMessage || "Decision execution failed");
            }
            this.addOutputs(params, result);
            return { Success: true, ResultCode: RunDecisionResultCodes.SUCCESS, Message: this.buildSummaryMessage(result.Answers) };
        } catch (error) {
            return this.failure(RunDecisionResultCodes.EXECUTION_ERROR, error instanceof Error ? error.message : String(error));
        }
    }

    /** Validates State and Questions and resolves the prompt name, before any model is called. */
    private readInputs(params: RunActionParams): InputsResult {
        const state = this.validateState(this.getParamValue(params, "state"));
        if (!state.valid) {
            return { failure: this.failure(RunDecisionResultCodes.MISSING_STATE, state.message) };
        }
        const questions = this.parseAndValidateQuestions(this.getParamValue(params, "questions"));
        if (!questions.valid) {
            return { failure: this.failure(RunDecisionResultCodes.INVALID_QUESTIONS, questions.message) };
        }
        const promptName = this.getStringParam(params, "decisionpromptname") || RunDecisionAction.DEFAULT_PROMPT_NAME;
        return { state: state.state, questions: questions.questions, promptName };
    }

    private buildDecisionParams(
        params: RunActionParams,
        prompt: MJAIPromptEntityExtended,
        state: string | Record<string, unknown>,
        questions: Record<string, DecisionQuestion>
    ): AIDecisionParams {
        const decisionParams = new AIDecisionParams();
        decisionParams.prompt = prompt;
        decisionParams.contextUser = params.ContextUser;
        decisionParams.Questions = questions;
        decisionParams.State = state;
        if (params.AbortSignal) {
            decisionParams.cancellationToken = params.AbortSignal;
        }
        return decisionParams;
    }

    private addOutputs(params: RunActionParams, result: AIDecisionRunResult): void {
        this.addOutputParam(params, "Answers", result.Answers);
        this.addOutputParam(params, "ModelName", result.modelInfo?.modelName ?? null);
        this.addOutputParam(params, "ResolvedModel", result.DecisionResult?.ResolvedModel ?? null);
        this.addOutputParam(params, "PromptRunID", result.promptRun?.ID ?? null);
    }

    private failure(code: RunDecisionResultCode, message: string): ActionResultSimple {
        return { Success: false, ResultCode: code, Message: message };
    }

    private validateState(rawState: unknown): StateValidationResult {
        if (rawState === undefined || rawState === null) {
            return { valid: false, message: "State parameter is required" };
        }
        if (typeof rawState === "string") {
            const trimmed = rawState.trim();
            if (trimmed.length === 0) {
                return { valid: false, message: "State parameter cannot be empty" };
            }
            return { valid: true, state: trimmed };
        }
        if (this.isObject(rawState)) {
            if (Object.keys(rawState).length === 0) {
                return { valid: false, message: "State object cannot be empty" };
            }
            return { valid: true, state: rawState };
        }
        return { valid: false, message: "State parameter must be a non-empty string or object" };
    }

    private parseAndValidateQuestions(rawQuestions: unknown): QuestionsValidationResult {
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

        if (!this.isObject(parsed)) {
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
            const qValidation = this.validateQuestion(key, q);
            if (!qValidation.valid) {
                return { valid: false, message: qValidation.message };
            }
            questions[key] = qValidation.question;
        }

        return { valid: true, questions };
    }

    private validateQuestion(key: string, q: unknown): QuestionValidationResult {
        if (!this.isObject(q)) {
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
            const options = q["Options"];
            if (!Array.isArray(options)) {
                return { valid: false, message: `Question '${key}' of Kind 'Choice' must have an Options array` };
            }
            for (const opt of options) {
                if (!this.isObject(opt) || typeof opt["Value"] !== "string" || typeof opt["Description"] !== "string") {
                    return { valid: false, message: `Question '${key}' Options must contain objects with string Value and Description` };
                }
            }
            return {
                valid: true,
                question: {
                    Kind: "Choice",
                    Instructions: instructions,
                    Options: options.map(o => ({
                        Value: String((o as Record<string, unknown>)["Value"]),
                        Description: String((o as Record<string, unknown>)["Description"]),
                    })),
                },
            };
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

    private buildSummaryMessage(answers: Record<string, DecisionAnswer>): string {
        const summary: Record<string, unknown> = {};
        for (const [key, answer] of Object.entries(answers)) {
            if (answer.Kind === "Likelihood") {
                summary[key] = answer.Probability;
            } else if (answer.Kind === "Choice" || answer.Kind === "Score") {
                summary[key] = answer.Value;
            }
        }
        return JSON.stringify(summary);
    }

    /** Finds the decision prompt in AIEngine's cache, by name, case-insensitively. */
    private async loadPrompt(promptName: string, contextUser?: UserInfo): Promise<MJAIPromptEntityExtended | null> {
        await AIEngine.Instance.Config(false, contextUser);
        const target = promptName.trim().toLowerCase();
        return AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target) ?? null;
    }

    private addOutputParam(params: RunActionParams, name: string, value: unknown): void {
        if (!params.Params) {
            params.Params = [];
        }
        const existing = params.Params.find(p => p.Name.toLowerCase() === name.toLowerCase() && p.Type === "Output");
        if (existing) {
            existing.Value = value;
        } else {
            params.Params.push({
                Name: name,
                Type: "Output",
                Value: value,
            });
        }
    }

    private getParamValue(params: RunActionParams, name: string): unknown {
        const param = params.Params?.find(p => p.Name.toLowerCase() === name.toLowerCase());
        return param?.Value;
    }

    private getStringParam(params: RunActionParams, name: string): string | undefined {
        const value = this.getParamValue(params, name);
        if (typeof value === "string") {
            const trimmed = value.trim();
            return trimmed.length > 0 ? trimmed : undefined;
        }
        return undefined;
    }

    private isObject(val: unknown): val is Record<string, unknown> {
        return typeof val === "object" && val !== null && !Array.isArray(val);
    }
}
