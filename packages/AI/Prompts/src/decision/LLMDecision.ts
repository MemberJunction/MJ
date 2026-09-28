/**
 * @fileoverview LLM-based Decision Driver for MemberJunction.
 *
 * Executes multi-question decisions by formatting state, questions, and expected output format
 * into template variables, running an AI prompt via AIPromptRunner, and normalizing/mapping
 * the model output into strongly typed DecisionAnswers.
 *
 * @module @memberjunction/ai-prompts
 */

import { RegisterClass, UUIDsEqual } from '@memberjunction/global';
import { UserInfo, LogError, LogStatus } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import {
    BaseDecision,
    DecisionParams,
    DecisionResult,
    DecisionQuestion,
    DecisionAnswer,
    LikelihoodAnswer,
    ChoiceAnswer,
    ScoreAnswer,
    ChoiceQuestion,
    ScoreQuestion,
    ModelUsage,
} from '@memberjunction/ai';
import {
    AIPromptParams,
    AIPromptRunResult,
    MJAIPromptEntityExtended,
} from '@memberjunction/ai-core-plus';
import { AIPromptRunner } from '../AIPromptRunner';

/** Longest slice of an unparseable reply quoted in an error message. */
const MAX_REPLY_IN_ERROR = 500;

/**
 * Driver that answers typed decision questions with a chat LLM through an MJ prompt. It is the
 * fallback `BaseDecision` driver: everything downstream can be written against `BaseDecision`
 * before a native decision model is configured. Unlike a native driver it must parse, because a
 * chat model can return malformed JSON.
 *
 * The prompt receives three template variables:
 * - `state`: the decision state, as-is when it is a string, otherwise as indented JSON;
 * - `questions`: JSON mapping each question key to `{ kind, instructions, options?, levels? }`;
 * - `outputFormat`: JSON showing the reply's shape, with every option or level listed.
 *
 * It must reply with one JSON object with the same keys: a number for a Likelihood, and an object
 * mapping every option value (Choice) or level name (Score) to a number. Choice and Score
 * distributions are normalised here, so `BaseDecision.Decide` can validate them strictly.
 *
 * Registered with ClassFactory under BaseDecision with key 'LLMDecision'.
 */
@RegisterClass(BaseDecision, 'LLMDecision')
export class LLMDecision extends BaseDecision {
    private _promptID: string;
    private _contextUser: UserInfo;
    private _promptRunner: AIPromptRunner;
    private _cachedPrompt: MJAIPromptEntityExtended | null = null;

    /**
     * Creates an instance of LLMDecision.
     *
     * @param apiKey - Optional API key for BaseDecision/BaseModel compatibility.
     * @param promptID - ID of the MJAIPrompt entity to execute.
     * @param contextUser - User context for prompt execution.
     */
    constructor(apiKey: string, promptID: string, contextUser: UserInfo) {
        super(apiKey);
        this._promptID = promptID;
        this._contextUser = contextUser;
        this._promptRunner = new AIPromptRunner();
    }

    /**
     * Gets the configured prompt ID.
     */
    public get PromptID(): string {
        return this._promptID;
    }

    /**
     * Executes the decision by calling the AI prompt and mapping answers.
     *
     * @param params - Parameters for the decision including State and Questions.
     * @returns DecisionResult containing answers or error details.
     */
    protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
        const prompt = this.loadPrompt();
        if (!prompt) {
            LogError(`LLMDecision: Prompt not found with ID: ${this._promptID}`);
            return this.failure(`Prompt not found with ID: ${this._promptID}`);
        }

        const promptParams = this.buildPromptParams(prompt, params);
        const promptResult = await this._promptRunner.ExecutePrompt(promptParams);
        if (!promptResult || !promptResult.success) {
            return this.failure(promptResult?.errorMessage || 'Prompt execution failed', promptResult);
        }

        const parsedReply = this.parseReply(promptResult);
        if ('error' in parsedReply) {
            return this.failure(parsedReply.error, promptResult);
        }

        const answers: Record<string, DecisionAnswer> = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            const mapped = this.mapQuestion(key, question, parsedReply.data);
            if ('error' in mapped) {
                return this.failure(mapped.error, promptResult);
            }
            answers[key] = mapped.answer;
        }

        const result = new DecisionResult(true, new Date(), new Date());
        result.Answers = answers;
        this.recordTelemetry(result, promptResult);
        return result;
    }

    /**
     * Builds a failed result. `BaseDecision.Decide` sets the timings. Usage and the model are
     * recorded whenever the prompt ran, because a failed mapping still cost a model call.
     */
    private failure(message: string, promptResult?: AIPromptRunResult | null): DecisionResult {
        const failure = new DecisionResult(false, new Date(), new Date());
        failure.errorMessage = message;
        if (promptResult) {
            this.recordTelemetry(failure, promptResult);
        }
        return failure;
    }

    /**
     * Loads the prompt entity from AIEngine with caching.
     */
    private loadPrompt(): MJAIPromptEntityExtended | null {
        if (this._cachedPrompt) {
            return this._cachedPrompt;
        }

        const prompts = AIEngine.Instance.Prompts;
        const prompt = prompts?.find(p => UUIDsEqual(p.ID, this._promptID));
        if (!prompt) {
            return null;
        }

        this._cachedPrompt = prompt;
        return prompt;
    }

    /**
     * Builds the AIPromptParams instance with template data and cancellation token.
     */
    private buildPromptParams(prompt: MJAIPromptEntityExtended, params: DecisionParams): AIPromptParams {
        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.contextUser = this._contextUser;
        promptParams.attemptJSONRepair = true;
        // The reply's keys are question keys, option values and level names, and level names are
        // often sentences such as "blocked: no workaround". The runner's output validation reads
        // ':', '?' and '*' in keys as OutputExample syntax and strips them, which would rename those
        // keys. This driver maps the reply itself and BaseDecision validates the answers, so skip it.
        promptParams.skipValidation = true;
        promptParams.cancellationToken = params.CancellationToken;
        promptParams.data = {
            state: this.formatState(params.State),
            questions: this.formatQuestionsSpec(params.Questions),
            outputFormat: this.formatOutputTemplate(params.Questions),
        };
        return promptParams;
    }

    /**
     * Formats state parameter: as-is if string, JSON stringified if object.
     */
    private formatState(state: string | Record<string, unknown>): string {
        if (typeof state === 'string') {
            return state;
        }
        return JSON.stringify(state, null, 1);
    }

    /**
     * Formats question specifications into JSON string.
     */
    private formatQuestionsSpec(questions: Record<string, DecisionQuestion>): string {
        const spec: Record<string, {
            kind: string;
            instructions: string;
            options?: Array<{ value: string; description: string }>;
            levels?: string[];
        }> = {};

        for (const [key, q] of Object.entries(questions)) {
            if (q.Kind === 'Likelihood') {
                spec[key] = {
                    kind: 'Likelihood',
                    instructions: q.Instructions,
                };
            } else if (q.Kind === 'Choice') {
                spec[key] = {
                    kind: 'Choice',
                    instructions: q.Instructions,
                    options: q.Options.map(opt => ({
                        value: opt.Value,
                        description: opt.Description,
                    })),
                };
            } else if (q.Kind === 'Score') {
                spec[key] = {
                    kind: 'Score',
                    instructions: q.Instructions,
                    levels: [...q.Levels],
                };
            }
        }

        return JSON.stringify(spec, null, 1);
    }

    /**
     * Formats output template specification into JSON string.
     */
    private formatOutputTemplate(questions: Record<string, DecisionQuestion>): string {
        const template: Record<string, string | Record<string, string>> = {};

        for (const [key, q] of Object.entries(questions)) {
            if (q.Kind === 'Likelihood') {
                template[key] = '<probability 0-1>';
            } else if (q.Kind === 'Choice') {
                const optionMap: Record<string, string> = {};
                for (const opt of q.Options) {
                    optionMap[opt.Value] = '<probability>';
                }
                template[key] = optionMap;
            } else if (q.Kind === 'Score') {
                const levelMap: Record<string, string> = {};
                for (const lvl of q.Levels) {
                    levelMap[lvl] = '<probability>';
                }
                template[key] = levelMap;
            }
        }

        return JSON.stringify(template, null, 1);
    }

    /**
     * Parses the model reply from the prompt result into an object record.
     */
    private parseReply(
        promptResult: AIPromptRunResult
    ): { success: true; data: Record<string, unknown> } | { success: false; error: string } {
        let raw: unknown = promptResult.result ?? promptResult.rawResult;

        if (typeof raw === 'string') {
            const text = raw;
            try {
                raw = JSON.parse(text);
            } catch {
                return {
                    success: false,
                    error: `Failed to parse model reply as JSON: ${text.slice(0, MAX_REPLY_IN_ERROR)}`,
                };
            }
        }

        if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
            return { success: true, data: raw as Record<string, unknown> };
        }

        return {
            success: false,
            error: `Model reply is not a JSON object: ${typeof raw === 'object' && raw !== null ? 'Array' : String(raw)}`,
        };
    }

    /**
     * Maps an individual question from the parsed reply to a DecisionAnswer.
     */
    private mapQuestion(
        key: string,
        question: DecisionQuestion,
        reply: Record<string, unknown>
    ): { success: true; answer: DecisionAnswer } | { success: false; error: string } {
        if (!Object.prototype.hasOwnProperty.call(reply, key) || reply[key] === undefined) {
            return { success: false, error: `Question '${key}': Missing answer in model reply` };
        }

        const rawVal = reply[key];
        switch (question.Kind) {
            case 'Likelihood':
                return this.mapLikelihood(key, rawVal);
            case 'Choice':
                return this.mapChoice(key, question, rawVal);
            case 'Score':
                return this.mapScore(key, question, rawVal);
            default: {
                const exhaustiveCheck: never = question;
                return { success: false, error: `Question '${key}': Unknown Kind '${(exhaustiveCheck as DecisionQuestion).Kind}'` };
            }
        }
    }

    /**
     * Maps a Likelihood question answer: clamps finite number to [0, 1].
     */
    private mapLikelihood(
        key: string,
        rawVal: unknown
    ): { success: true; answer: LikelihoodAnswer } | { success: false; error: string } {
        if (typeof rawVal !== 'number' || !Number.isFinite(rawVal)) {
            return {
                success: false,
                error: `Question '${key}': Likelihood value must be a finite number, got ${typeof rawVal === 'string' ? `"${rawVal}"` : String(rawVal)}`,
            };
        }

        const probability = Math.max(0, Math.min(1, rawVal));
        return {
            success: true,
            answer: {
                Kind: 'Likelihood',
                Probability: probability,
            },
        };
    }

    /**
     * Maps a Choice question answer: normalizes distribution, selects argmax, tie goes to first option.
     */
    private mapChoice(
        key: string,
        question: ChoiceQuestion,
        rawVal: unknown
    ): { success: true; answer: ChoiceAnswer } | { success: false; error: string } {
        const optionValues = question.Options.map(o => o.Value);
        const normResult = this.normalizeDistribution(key, 'Choice', optionValues, rawVal);
        if ('error' in normResult) {
            return { success: false, error: normResult.error };
        }

        const probabilities = normResult.probabilities;
        let bestOptionValue = question.Options[0].Value;
        let maxProb = -1;

        for (const opt of question.Options) {
            const prob = probabilities[opt.Value];
            if (prob > maxProb) {
                maxProb = prob;
                bestOptionValue = opt.Value;
            }
        }

        return {
            success: true,
            answer: {
                Kind: 'Choice',
                Value: bestOptionValue,
                Confidence: maxProb,
                Probabilities: probabilities,
            },
        };
    }

    /**
     * Maps a Score question answer: normalizes distribution, computes expected level position, max prob confidence.
     */
    private mapScore(
        key: string,
        question: ScoreQuestion,
        rawVal: unknown
    ): { success: true; answer: ScoreAnswer } | { success: false; error: string } {
        const normResult = this.normalizeDistribution(key, 'Score', question.Levels, rawVal);
        if ('error' in normResult) {
            return { success: false, error: normResult.error };
        }

        const probabilities = normResult.probabilities;
        let expectedPosition = 0;
        let maxProb = -1;

        for (let i = 0; i < question.Levels.length; i++) {
            const levelName = question.Levels[i];
            const prob = probabilities[levelName];
            expectedPosition += i * prob;
            if (prob > maxProb) {
                maxProb = prob;
            }
        }

        return {
            success: true,
            answer: {
                Kind: 'Score',
                Value: expectedPosition,
                Confidence: maxProb,
                Probabilities: probabilities,
            },
        };
    }

    /**
     * Normalizes a probability distribution for Choice or Score questions.
     * Validates object shape, ignores unexpected keys with LogStatus, takes non-negative finite numbers (0 otherwise),
     * fails if sum <= 0, and divides each by the sum.
     */
    private normalizeDistribution(
        questionKey: string,
        kind: 'Choice' | 'Score',
        expectedKeys: string[],
        rawVal: unknown
    ): { success: true; probabilities: Record<string, number> } | { success: false; error: string } {
        if (typeof rawVal !== 'object' || rawVal === null || Array.isArray(rawVal)) {
            return {
                success: false,
                error: `Question '${questionKey}': ${kind} answer must be an object`,
            };
        }

        const rawRecord = rawVal as Record<string, unknown>;
        const expectedSet = new Set(expectedKeys);

        for (const actualKey of Object.keys(rawRecord)) {
            if (!expectedSet.has(actualKey)) {
                LogStatus(`LLMDecision: Question '${questionKey}': ignoring unexpected key '${actualKey}' in ${kind} answer`);
            }
        }

        const rawProbs: Record<string, number> = {};
        let sum = 0;
        for (const expectedKey of expectedKeys) {
            const itemVal = rawRecord[expectedKey];
            const num = typeof itemVal === 'number' && Number.isFinite(itemVal) && itemVal >= 0 ? itemVal : 0;
            rawProbs[expectedKey] = num;
            sum += num;
        }

        if (sum <= 0) {
            return {
                success: false,
                error: `Question '${questionKey}': ${kind} probabilities sum to ${sum}, must be greater than 0`,
            };
        }

        const normalized: Record<string, number> = {};
        for (const expectedKey of expectedKeys) {
            normalized[expectedKey] = rawProbs[expectedKey] / sum;
        }

        return { success: true, probabilities: normalized };
    }

    /**
     * Populates Usage and ResolvedModel telemetry on DecisionResult from prompt result.
     */
    private recordTelemetry(decisionResult: DecisionResult, promptResult: AIPromptRunResult): void {
        decisionResult.Usage = new ModelUsage(
            promptResult.promptTokens ?? 0,
            promptResult.completionTokens ?? 0,
            promptResult.cost,
            promptResult.costCurrency
        );
        if (promptResult.modelInfo?.modelName) {
            decisionResult.ResolvedModel = promptResult.modelInfo.modelName;
        }
    }
}

/**
 * Factory function to create an LLMDecision instance.
 *
 * @param promptID - ID of the prompt to execute.
 * @param contextUser - User context for prompt execution.
 * @returns Configured LLMDecision instance.
 */
export function CreateLLMDecision(promptID: string, contextUser: UserInfo): LLMDecision {
    return new LLMDecision('', promptID, contextUser);
}
