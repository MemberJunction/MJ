import { Resolver, Mutation, Arg, Ctx, ObjectType, Field, Int } from 'type-graphql';
import { AppContext, UserPayload } from '../types.js';
import { LogError, UserInfo } from '@memberjunction/core';
import { UUIDsEqual } from '@memberjunction/global';
import { MJAIPromptEntityExtended } from '@memberjunction/ai-core-plus';
import { AIDecisionRunner, AIDecisionParams, AIDecisionRunResult, ParseDecisionQuestions } from '@memberjunction/ai-prompts';
import { DecisionQuestion } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { ResolverBase } from '../generic/ResolverBase.js';

/**
 * The result of the `RunDecision` mutation. Every failure, an authorization denial included, comes
 * back as `success: false` with an `errorMessage`: the mutation never throws to the client.
 */
@ObjectType()
export class DecisionRunResult {
    @Field()
    success: boolean;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, camelCase like AIPromptRunResult's — clients query it by this name

    @Field({ nullable: true })
    errorMessage?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, camelCase like AIPromptRunResult's — clients query it by this name

    /** The `DecisionAnswer` map by question key, as JSON. Set only on success. */
    @Field({ nullable: true })
    answersJSON?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, camelCase like AIPromptRunResult's — clients query it by this name

    @Field({ nullable: true })
    promptRunId?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, camelCase like AIPromptRunResult's — clients query it by this name

    /** The model that answered, after any failover, or the one selected when the call failed. */
    @Field({ nullable: true })
    modelName?: string;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, camelCase like AIPromptRunResult's — clients query it by this name

    @Field({ nullable: true })
    executionTimeMs?: number;  // case-violation-ok-legacy-back-compat: the property name is the GraphQL schema field name, camelCase like AIPromptRunResult's — clients query it by this name
}

/** The arguments of one `RunDecision` call. */
interface DecisionRequest {
    State: string;
    Questions: string;
    PromptID?: string;
    PromptName?: string;
    TimeoutMS?: number;
}

/** The prompt a request names: by ID, or by name. */
interface DecisionPromptReference {
    By: 'ID' | 'Name';
    Value: string;
}

/** The validated state and questions of one request. */
interface DecisionInputs {
    State: string | Record<string, unknown>;
    Questions: Record<string, DecisionQuestion>;
}

/**
 * Runs typed decisions (Likelihood, Choice, Score) for clients in one round trip, through
 * `AIDecisionRunner`. It is the direct path for latency-sensitive browser callers: the `Run Decision`
 * action does the same work with action-execution overhead on top.
 *
 * The request path adds no entity load: the prompt comes from `AIEngine`'s cache.
 */
@Resolver()
export class RunDecisionResolver extends ResolverBase {
    /** The prompt used when the caller names none, as for the `Run Decision` action. */
    public static readonly DEFAULT_PROMPT_NAME = 'Default Decision';

    /**
     * Answers typed questions about a state with a Decision-typed prompt.
     *
     * Authorization is `RunAIPrompt`'s: the API-key `prompt:execute` scope check for the prompt the
     * caller names, before any other work (a session without an API key skips it). A denial is
     * returned as `success: false`, not thrown.
     *
     * @param state The state the questions are about: text, or the JSON text of an object.
     * @param questions The `DecisionQuestion` map by question key, as JSON: the shape `Run Decision` accepts.
     * @param promptId The decision prompt's ID. Takes precedence over `promptName`.
     * @param promptName The decision prompt's name, matched case-insensitively. Defaults to `Default Decision`.
     * @param timeoutMS Bounds each model call, as the runner's `timeoutMS`. Unset or not positive means unbounded.
     */
    @Mutation(() => DecisionRunResult)
    async RunDecision(
        @Arg('state') state: string,
        @Arg('questions') questions: string,
        @Ctx() { userPayload }: AppContext,
        @Arg('promptId', { nullable: true }) promptId?: string,
        @Arg('promptName', { nullable: true }) promptName?: string,
        @Arg('timeoutMS', () => Int, { nullable: true }) timeoutMS?: number
    ): Promise<DecisionRunResult> {
        const startTime = Date.now();
        try {
            const request: DecisionRequest = { State: state, Questions: questions, PromptID: promptId, PromptName: promptName, TimeoutMS: timeoutMS };
            return await this.runDecision(request, userPayload, startTime);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            LogError(`RunDecision failed: ${message}`, undefined, error);
            return this.failure(message || 'Unknown error occurred', startTime);
        }
    }

    /** Authorizes, validates, resolves the prompt, and runs the decision. Throws only on unexpected errors. */
    private async runDecision(request: DecisionRequest, userPayload: UserPayload, startTime: number): Promise<DecisionRunResult> {
        const reference = this.promptReference(request);
        await this.CheckAPIKeyScopeAuthorization('prompt:execute', reference.Value, userPayload);

        const currentUser = this.GetUserFromPayload(userPayload);
        if (!currentUser) {
            return this.failure('Unable to determine current user', startTime);
        }
        const inputs = this.validateInputs(request);
        if ('Error' in inputs) {
            return this.failure(inputs.Error, startTime);
        }
        const runner = new AIDecisionRunner();
        const prompt = await this.resolvePrompt(reference, runner, currentUser);
        if (typeof prompt === 'string') {
            return this.failure(prompt, startTime);
        }
        const result = await runner.ExecuteDecision(this.buildDecisionParams(prompt, inputs, currentUser, request.TimeoutMS));
        return this.mapRunResult(result, prompt, startTime);
    }

    /** The prompt the request names: its ID when given, otherwise its name, otherwise the default. */
    private promptReference(request: DecisionRequest): DecisionPromptReference {
        const id = request.PromptID?.trim();
        if (id) {
            return { By: 'ID', Value: id };
        }
        const name = request.PromptName?.trim();
        return { By: 'Name', Value: name || RunDecisionResolver.DEFAULT_PROMPT_NAME };
    }

    /** Validates the state and the questions, or returns the first problem found. */
    private validateInputs(request: DecisionRequest): DecisionInputs | { Error: string } {
        const state = this.parseState(request.State);
        if ('Error' in state) {
            return state;
        }
        const questions = ParseDecisionQuestions(request.Questions);
        if (!questions.Valid) {
            return { Error: questions.Message };
        }
        return { State: state.State, Questions: questions.Questions };
    }

    /**
     * Reads the state: the object, when the text is the JSON of a non-empty object, otherwise the text
     * itself. Empty text and an empty object are refused, as the `Run Decision` action refuses them.
     */
    private parseState(state: string): { State: string | Record<string, unknown> } | { Error: string } {
        const trimmed = typeof state === 'string' ? state.trim() : '';
        if (trimmed.length === 0) {
            return { Error: 'State is required and cannot be empty' };
        }
        const parsed = this.parseJSONObject(trimmed);
        if (!parsed) {
            return { State: trimmed };
        }
        return Object.keys(parsed).length > 0 ? { State: parsed } : { Error: 'State object cannot be empty' };
    }

    /** The text parsed as a JSON object, or undefined when it is not the JSON of an object. */
    private parseJSONObject(text: string): Record<string, unknown> | undefined {
        if (!text.startsWith('{')) {
            return undefined;
        }
        try {
            const parsed: unknown = JSON.parse(text);
            return this.isPlainObject(parsed) ? parsed : undefined;
        } catch {
            return undefined;
        }
    }

    private isPlainObject(value: unknown): value is Record<string, unknown> {
        return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    /**
     * Finds the prompt in `AIEngine`'s cache and checks that it can run a decision: that it is
     * Decision-typed and Active. Returns the reason when it cannot.
     */
    private async resolvePrompt(
        reference: DecisionPromptReference,
        runner: AIDecisionRunner,
        contextUser: UserInfo
    ): Promise<MJAIPromptEntityExtended | string> {
        await AIEngine.Instance.Config(false, contextUser);
        const prompt = this.findPrompt(reference);
        if (!prompt) {
            return reference.By === 'ID'
                ? `AI Prompt with ID ${reference.Value} not found`
                : `AI Prompt '${reference.Value}' not found`;
        }
        if (!this.isDecisionPrompt(prompt, runner)) {
            return `AI Prompt '${prompt.Name}' is not a Decision prompt: its AI model type must be '${runner.RequiredModelType}'`;
        }
        if (prompt.Status !== 'Active') {
            return `AI Prompt '${prompt.Name}' is not active (Status: ${prompt.Status})`;
        }
        return prompt;
    }

    /** Looks the prompt up by ID, or by name case-insensitively, as the `Run Decision` action does. */
    private findPrompt(reference: DecisionPromptReference): MJAIPromptEntityExtended | undefined {
        const prompts = AIEngine.Instance.Prompts;
        if (reference.By === 'ID') {
            return prompts.find(p => UUIDsEqual(p.ID, reference.Value));
        }
        const target = reference.Value.toLowerCase();
        return prompts.find(p => p.Name?.trim().toLowerCase() === target);
    }

    /**
     * Whether the prompt's AI model type is the one `AIDecisionRunner` requires. A prompt with no model
     * type is refused too: the runner would accept it, but nothing marks it as a decision prompt.
     */
    private isDecisionPrompt(prompt: MJAIPromptEntityExtended, runner: AIDecisionRunner): boolean {
        if (!prompt.AIModelTypeID) {
            return false;
        }
        const required = runner.RequiredModelType.trim().toLowerCase();
        const decisionType = AIEngine.Instance.ModelTypes.find(mt => mt.Name?.trim().toLowerCase() === required);
        return !!decisionType && UUIDsEqual(prompt.AIModelTypeID, decisionType.ID);
    }

    private buildDecisionParams(
        prompt: MJAIPromptEntityExtended,
        inputs: DecisionInputs,
        contextUser: UserInfo,
        timeoutMS: number | undefined
    ): AIDecisionParams {
        const params = new AIDecisionParams();
        params.prompt = prompt;
        params.contextUser = contextUser;
        params.State = inputs.State;
        params.Questions = inputs.Questions;
        if (timeoutMS != null) {
            params.timeoutMS = timeoutMS;
        }
        return params;
    }

    /** Maps the runner's result. The answers are sent only on success, so a caller never acts on partial ones. */
    private mapRunResult(result: AIDecisionRunResult, prompt: MJAIPromptEntityExtended, startTime: number): DecisionRunResult {
        const mapped: DecisionRunResult = {
            success: result.success,
            promptRunId: result.promptRun?.ID,
            modelName: result.modelInfo?.modelName,
            executionTimeMs: Date.now() - startTime,
        };
        if (result.success) {
            mapped.answersJSON = JSON.stringify(result.Answers ?? {});
        } else {
            mapped.errorMessage = result.errorMessage || 'Decision execution failed';
            LogError(`RunDecision failed for prompt '${prompt.Name}': ${mapped.errorMessage}`);
        }
        return mapped;
    }

    private failure(errorMessage: string, startTime: number): DecisionRunResult {
        return {
            success: false,
            errorMessage,
            executionTimeMs: Date.now() - startTime,
        };
    }
}
