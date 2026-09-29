/**
 * @fileoverview Runner for reranking: model selection, credentials, failover, and an
 * `MJ: AI Prompt Runs` row for every call.
 *
 * @module @memberjunction/ai-reranker
 */

import { MJGlobal, NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { BaseReranker, BaseResult, ErrorAnalyzer } from '@memberjunction/ai';
import type { AIErrorType, ModelUsage, RerankParams, RerankResponse } from '@memberjunction/ai';
import { AIModelSelectionInfo, AIPromptParams } from '@memberjunction/ai-core-plus';
import type {
    MJAIModelEntityExtended,
    MJAIPromptEntityExtended,
    MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import { BaseModelRunner } from '@memberjunction/ai-prompts';
import type { FailoverAttempt, ModelVendorCandidate } from '@memberjunction/ai-prompts';
import type { AIRerankParams, AIRerankRunResult } from './rerank-runner.types';
import { LLMReranker } from './LLMReranker';

/** The driver class of the prompt-backed reranker, which needs no API key of its own. */
const LLM_RERANKER_DRIVER = 'LLMReranker';

/** The prompt whose bindings choose the reranker when the caller names none. */
const DEFAULT_RERANK_PROMPT_NAME = 'Default Rerank';

/**
 * The seeded LLM reranker model. It has no model-vendor row and so no driver class of its own;
 * `RerankerService.GetReranker` recognises it by this name.
 */
const LEGACY_LLM_RERANKER_MODEL_NAME = 'LLM Reranker';

/** One candidate's rerank call, as the base failover loop sees it. */
class RerankAttempt extends BaseResult {
    /** The driver's response, when the driver returned one. */
    public Response?: RerankResponse;
}

/** The outcome of a rerank, and the candidate that produced it after any failover. */
interface RerankRun {
    Attempt: RerankAttempt;
    AnsweredBy: ModelVendorCandidate;
}

/** The candidate selected for a rerank, with the credential probes made while selecting it. */
interface RerankSelection {
    Candidate: ModelVendorCandidate;
    CredentialAvailability: Map<string, boolean>;
}

/** A validated request: the caller's parameters, its prompt, and the prompt parameters the base reads. */
interface RerankRequest {
    Params: AIRerankParams;
    Prompt: MJAIPromptEntityExtended;
    PromptParams: AIPromptParams;
}

/** What the ClassFactory hands back for a driver class. */
interface DriverResolution {
    Resolved: boolean;
    Instance: BaseReranker | null;
}

/**
 * Runs reranking on `Reranker`-type models. It does for a rerank what `AIDecisionRunner` does for a
 * decision: selects a model from the rerank prompt's bindings (or the model the caller pins),
 * resolves credentials, fails over, and writes an `MJ: AI Prompt Runs` row.
 *
 * The configuration carrier is an `MJ: AI Prompts` row, `Default Rerank` unless the caller names
 * another. It makes no chat call: the runner reads only its model bindings and failover settings.
 * Drivers are built through the ClassFactory with the same two branches as
 * `RerankerService.GetReranker`: the prompt-backed `LLMReranker`, and native drivers such as
 * `CohereReranker`.
 */
export class AIRerankerRunner extends BaseModelRunner {
    /** Reranks run only on `Reranker`-type models. */
    public override get RequiredModelType(): string {
        return 'Reranker';
    }

    protected override get DefaultLogCategory(): string {
        return 'AIRerankerRunner';
    }

    /**
     * Whether a driver needs its own API key. `LLMReranker` does not: it runs an MJ chat prompt whose
     * models resolve their own credentials.
     */
    protected DriverRequiresCredentials(driverClass: string): boolean {
        return driverClass !== LLM_RERANKER_DRIVER;
    }

    /** Treats a driver that needs no credentials as always available. */
    protected override HasCredentialsAvailable(
        driverClass: string,
        promptId: string | undefined,
        modelId: string | undefined,
        vendorId: string | undefined,
        params?: AIPromptParams
    ): boolean {
        if (!this.DriverRequiresCredentials(driverClass)) {
            return true;
        }
        return super.HasCredentialsAvailable(driverClass, promptId, modelId, vendorId, params);
    }

    /**
     * Whether a driver makes its model call through a prompt run of its own, which this runner makes
     * a child of the rerank's run. `LLMReranker` does: it runs a chat prompt, so its cost is that
     * child run's cost, not the rerank run's own.
     */
    private driverRunsChildPrompt(driverClass: string): boolean {
        return driverClass === LLM_RERANKER_DRIVER;
    }

    /**
     * Reranks `params.documents` against `params.query`. Never throws: every failure is a result with
     * `Success: false` and an `ErrorMessage`. An exception after the run row exists finalizes the row
     * as failed.
     */
    public async RunRerank(params: AIRerankParams): Promise<AIRerankRunResult> {
        const startTime = new Date();
        let promptRun: MJAIPromptRunEntityExtended | undefined;
        let selected: ModelVendorCandidate | undefined;
        try {
            const request = this.buildRequest(params);
            if (typeof request === 'string') {
                return this.failedRunResult(request, startTime);
            }
            const candidates = this.buildCandidates(request);
            if (typeof candidates === 'string') {
                return this.failedRunResult(candidates, startTime);
            }
            const selection = this.selectCandidate(request, candidates);
            if (typeof selection === 'string') {
                return this.failedRunResult(selection, startTime);
            }
            selected = selection.Candidate;
            const selectionInfo = this.buildSelectionInfo(request.Prompt, candidates, selection);
            promptRun = await this.CreateRunRecord(request.Prompt, selected.model, request.PromptParams, startTime, selected.vendorId, selectionInfo, run => {
                run.Messages = this.describeRequest(params);
            });
            const run = await this.runRerank(request, candidates, selection, promptRun);
            const endTime = new Date();
            const executionTimeMS = endTime.getTime() - startTime.getTime();
            await this.finalizeRerankRun(promptRun, run, endTime, executionTimeMS);
            return this.buildRunResult(run, promptRun, executionTimeMS);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            if (promptRun) {
                await this.finalizeFailedRun(promptRun, message, startTime);
            }
            return this.failedRunResult(message, startTime, promptRun, selected);
        }
    }

    /** Finalizes a run row as failed, so an exception after it was created never leaves it 'Running'. */
    private async finalizeFailedRun(promptRun: MJAIPromptRunEntityExtended, message: string, startTime: Date): Promise<void> {
        const endTime = new Date();
        await this.FinalizeRunRecord(promptRun, false, endTime, endTime.getTime() - startTime.getTime(), run => {
            run.ErrorMessage = message;
        });
    }

    /** Validates the request and resolves its prompt, or returns the reason it cannot run. */
    private buildRequest(params: AIRerankParams): RerankRequest | string {
        const invalid = this.validateParams(params);
        if (invalid) {
            return invalid;
        }
        const prompt = this.resolvePrompt(params.PromptID);
        if (typeof prompt === 'string') {
            return prompt;
        }
        const promptParams = new AIPromptParams();
        promptParams.prompt = prompt;
        promptParams.contextUser = params.ContextUser;
        promptParams.parentPromptRunId = params.ParentRunID;
        promptParams.provider = this._provider ?? undefined;
        return { Params: params, Prompt: prompt, PromptParams: promptParams };
    }

    /** Returns an error message when the request cannot run, otherwise undefined. */
    private validateParams(params: AIRerankParams): string | undefined {
        if (!params?.ContextUser) {
            return 'A context user is required (params.ContextUser)';
        }
        if (!params.query || params.query.trim().length === 0) {
            return 'A query is required (params.query)';
        }
        if (!params.documents || params.documents.length === 0) {
            return 'At least one document is required (params.documents)';
        }
        return undefined;
    }

    /** The caller's rerank prompt, or `Default Rerank`; otherwise the reason it was not found. */
    private resolvePrompt(promptId: string | undefined): MJAIPromptEntityExtended | string {
        if (promptId) {
            return AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, promptId)) ?? `Rerank prompt ${promptId} was not found`;
        }
        return this.findPromptByName(DEFAULT_RERANK_PROMPT_NAME) ?? `The '${DEFAULT_RERANK_PROMPT_NAME}' prompt was not found`;
    }

    /** A prompt by name, compared trimmed and case-insensitively. */
    private findPromptByName(name: string | null | undefined): MJAIPromptEntityExtended | undefined {
        const target = name?.trim().toLowerCase();
        return target ? AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target) : undefined;
    }

    /**
     * Builds the candidates, or returns the reason there are none. The base throws here when the
     * prompt is bound to another model type, or when the pinned model is of another type.
     */
    private buildCandidates(request: RerankRequest): ModelVendorCandidate[] | string {
        try {
            const built = this.BuildModelVendorCandidates(request.Prompt, request.Params.ModelID);
            const candidates = built.length > 0 ? built : this.legacyLLMRerankerCandidates(request.Params.ModelID);
            return candidates.length > 0 ? candidates : `No Reranker model candidates found for prompt '${request.Prompt.Name}'`;
        } catch (err: unknown) {
            return err instanceof Error ? err.message : String(err);
        }
    }

    /**
     * The candidate for the seeded `LLM Reranker` model when the caller pins it. That model has no
     * model-vendor row, so the base builds no candidate for it; `RerankerService.GetReranker`
     * recognises it by name, and so does this.
     */
    private legacyLLMRerankerCandidates(modelId: string | undefined): ModelVendorCandidate[] {
        const model = modelId ? AIEngine.Instance.ModelsByID.get(NormalizeUUID(modelId)) : undefined;
        if (!model || !model.IsActive || !this.isLegacyLLMReranker(model)) {
            return [];
        }
        return [{
            model,
            driverClass: LLM_RERANKER_DRIVER,
            apiName: model.APIName ?? undefined,
            isPreferredVendor: false,
            priority: 0,
            source: 'explicit',
        }];
    }

    /** Whether a model is the seeded LLM reranker, which has no active model-vendor row. */
    private isLegacyLLMReranker(model: MJAIModelEntityExtended): boolean {
        const hasActiveVendor = (model.ModelVendors ?? []).some(mv => mv.Status === 'Active');
        return !hasActiveVendor && model.Name === LEGACY_LLM_RERANKER_MODEL_NAME;
    }

    /** Selects the first candidate with credentials, or returns an error listing every candidate. */
    private selectCandidate(request: RerankRequest, candidates: ModelVendorCandidate[]): RerankSelection | string {
        const credentialAvailability = new Map<string, boolean>();
        let selected: ModelVendorCandidate | undefined;
        for (const candidate of candidates) {
            const available = this.HasCredentialsAvailable(candidate.driverClass, request.Prompt.ID, candidate.model.ID, candidate.vendorId, request.PromptParams);
            credentialAvailability.set(this.candidateKey(candidate), available);
            if (available && !selected) {
                selected = candidate;
            }
        }
        if (!selected) {
            const summary = candidates
                .map(c => `[Model: ${c.model.Name}, Vendor: ${c.vendorName ?? 'default'}, Driver: ${c.driverClass}]`)
                .join(', ');
            return `No Reranker model has credentials available for prompt '${request.Prompt.Name}'. Candidates: ${summary}`;
        }
        return { Candidate: selected, CredentialAvailability: credentialAvailability };
    }

    /**
     * Runs the selected candidate alone when failover is off, otherwise the base failover loop. Tracks
     * the candidate that produced the result, so the caller reports the model that actually answered.
     */
    private async runRerank(
        request: RerankRequest,
        candidates: ModelVendorCandidate[],
        selection: RerankSelection,
        promptRun: MJAIPromptRunEntityExtended
    ): Promise<RerankRun> {
        let answeredBy = selection.Candidate;
        const attempt = (candidate: ModelVendorCandidate): Promise<RerankAttempt> => {
            answeredBy = candidate;
            return this.executeOnCandidate(candidate, request, promptRun);
        };
        const failoverConfig = this.getFailoverConfiguration(request.Prompt);
        const result = failoverConfig.strategy === 'None'
            ? await attempt(selection.Candidate)
            : await this.ExecuteWithFailover<RerankAttempt>(
                request.Prompt,
                request.PromptParams,
                candidates,
                failoverConfig,
                attempt,
                (err, attempts) => this.createFailoverErrorResult(err, attempts),
                promptRun,
                selection.CredentialAvailability
            );
        return { Attempt: result, AnsweredBy: answeredBy };
    }

    /** Reranks on one candidate: resolves its key when it needs one, builds its driver, and calls it. */
    private async executeOnCandidate(
        candidate: ModelVendorCandidate,
        request: RerankRequest,
        promptRun: MJAIPromptRunEntityExtended
    ): Promise<RerankAttempt> {
        let apiKey = '';
        if (this.DriverRequiresCredentials(candidate.driverClass)) {
            try {
                apiKey = await this.ResolveCredentialForExecution(candidate.driverClass, request.Prompt.ID, candidate.model.ID, candidate.vendorId, request.PromptParams);
            } catch (err: unknown) {
                return this.failedAttempt(err instanceof Error ? err.message : String(err), 'Authentication');
            }
        }
        const driver = this.createDriver(candidate, apiKey, request.Params, promptRun.ID);
        if (typeof driver === 'string') {
            return this.failedAttempt(driver, 'ModelError');
        }
        if (this.driverRunsChildPrompt(candidate.driverClass)) {
            // The driver's run names this run as its parent, so this run's queued INSERT must land first.
            await this.WaitForPendingPromptRunSaves();
        }
        return this.callDriver(driver, candidate, request.Params);
    }

    /**
     * Builds the candidate's driver through the ClassFactory, with the same two branches as
     * `RerankerService.GetReranker`. `LLMReranker` takes no key, the model's `APIName`, the ID of the
     * chat prompt it runs and the context user; every other driver takes its key and API name.
     * Returns an error message when the driver cannot be built.
     *
     * An `LLMReranker` is also given `parentRunId`, the rerank's run, as its `ParentPromptRunID`, so
     * its chat run is a child of the rerank's run.
     */
    private createDriver(candidate: ModelVendorCandidate, apiKey: string, params: AIRerankParams, parentRunId: string): BaseReranker | string {
        const factory = MJGlobal.Instance.ClassFactory;
        let resolution: DriverResolution;
        if (candidate.driverClass === LLM_RERANKER_DRIVER) {
            const chatPromptID = params.ChatPromptID ?? this.findPromptByName(candidate.apiName)?.ID;
            if (!chatPromptID) {
                return `LLMReranker's chat prompt '${candidate.apiName ?? ''}' was not found`;
            }
            resolution = factory.TryCreateInstance<BaseReranker>(
                BaseReranker, candidate.driverClass, '', candidate.model.APIName ?? '', chatPromptID, params.ContextUser
            );
            if (resolution.Instance instanceof LLMReranker) {
                resolution.Instance.ParentPromptRunID = parentRunId;
            }
        } else {
            resolution = factory.TryCreateInstance<BaseReranker>(
                BaseReranker, candidate.driverClass, apiKey, candidate.apiName ?? candidate.model.APIName ?? ''
            );
        }
        if (!resolution.Resolved || !resolution.Instance) {
            return `No reranker driver is registered for driver class '${candidate.driverClass}'`;
        }
        return resolution.Instance;
    }

    /** Calls the driver with the rerank fields alone, and converts its response for the failover loop. */
    private async callDriver(driver: BaseReranker, candidate: ModelVendorCandidate, params: AIRerankParams): Promise<RerankAttempt> {
        const startTime = new Date();
        const driverParams: RerankParams = {
            query: params.query,
            documents: params.documents,
            topK: params.topK,
            options: params.options,
        };
        try {
            const response = await driver.Rerank(driverParams);
            if (!response.success) {
                const message = response.errorMessage || 'Reranking failed';
                return this.failedAttempt(message, this.errorTypeOf(new Error(message), candidate), response);
            }
            const succeeded = new RerankAttempt(true, startTime, new Date());
            succeeded.Response = response;
            return succeeded;
        } catch (err: unknown) {
            const error = err instanceof Error ? err : new Error(String(err));
            return this.failedAttempt(error.message, this.errorTypeOf(error, candidate));
        }
    }

    /**
     * The type of error a failure suggests. `BaseReranker` reports a failure only as a message, so the
     * message is classified; a vendor-level type then drops that vendor's other candidates.
     */
    private errorTypeOf(error: Error, candidate: ModelVendorCandidate): AIErrorType {
        return ErrorAnalyzer.AnalyzeError(error, candidate.vendorName).errorType;
    }

    /**
     * A failed call that allows failover to the next candidate. The severity must not be 'Fatal': the
     * failover loop stops on any Fatal error before it reads `canFailover`.
     */
    private failedAttempt(message: string, errorType: AIErrorType, response?: RerankResponse): RerankAttempt {
        const now = new Date();
        const failed = new RerankAttempt(false, now, now);
        failed.errorMessage = message;
        failed.errorInfo = { errorType, severity: 'Retriable', canFailover: true };
        failed.Response = response;
        return failed;
    }

    /** The result returned when every failover candidate has failed. */
    private createFailoverErrorResult(lastError: Error | null, failoverAttempts: FailoverAttempt[]): RerankAttempt {
        const now = new Date();
        const result = new RerankAttempt(false, now, now);
        result.errorMessage = lastError?.message || `Failover failed after ${failoverAttempts.length} attempts`;
        result.exception = lastError;
        if (lastError) {
            result.errorInfo = ErrorAnalyzer.AnalyzeError(lastError);
        }
        return result;
    }

    /**
     * Finalizes the run row with the ranked document IDs and scores in `Result`, and the cost the
     * driver reports in its response's `Usage`. It records no tokens: the only driver that reports
     * usage is `LLMReranker`, whose tokens are its chat run's and are recorded on that run. A driver
     * that reports no cost leaves the cost empty rather than guessed.
     */
    private async finalizeRerankRun(
        promptRun: MJAIPromptRunEntityExtended,
        rerankRun: RerankRun,
        endTime: Date,
        executionTimeMS: number
    ): Promise<void> {
        const attempt = rerankRun.Attempt;
        const costIsDescendant = this.driverRunsChildPrompt(rerankRun.AnsweredBy.driverClass);
        await this.FinalizeRunRecord(promptRun, attempt.success, endTime, executionTimeMS, run => {
            run.Result = JSON.stringify(this.rankedScores(attempt.Response));
            const usage = attempt.Response?.Usage;
            if (usage) {
                this.applyCost(run, usage, costIsDescendant);
            }
            if (!attempt.success && attempt.errorMessage) {
                run.ErrorMessage = attempt.errorMessage;
            }
        });
    }

    /**
     * Records the driver's cost on the run. When the cost was incurred by a child run
     * (`LLMReranker`'s chat prompt), it is the child's cost, so it is recorded as `DescendantCost`
     * and in `TotalCost`, never as this run's `Cost`: a report summing `Cost` over every run would
     * otherwise count the chat call twice. The child's save rolls the same `DescendantCost` up to
     * this run's row, so the two writes agree.
     */
    private applyCost(run: MJAIPromptRunEntityExtended, usage: ModelUsage, costIsDescendant: boolean): void {
        if (usage.cost !== undefined) {
            if (costIsDescendant) {
                run.DescendantCost = usage.cost;
                run.TotalCost = (run.Cost ?? 0) + usage.cost;
            } else {
                run.Cost = usage.cost;
            }
        }
        if (usage.costCurrency !== undefined) {
            run.CostCurrency = usage.costCurrency;
        }
    }

    /** The ranked document IDs and scores, without the document text. */
    private rankedScores(response: RerankResponse | undefined): Array<{ ID: string; Score: number }> {
        return (response?.results ?? []).map(r => ({ ID: r.id, Score: r.relevanceScore }));
    }

    /** The run row's `Messages`: the query, the document count and the agent run, never the documents. */
    private describeRequest(params: AIRerankParams): string {
        return JSON.stringify({
            Query: params.query,
            DocumentCount: params.documents.length,
            AgentRunID: params.AgentRunID,
        });
    }

    /** Builds the caller's result, naming the candidate that answered. */
    private buildRunResult(run: RerankRun, promptRun: MJAIPromptRunEntityExtended, executionTimeMS: number): AIRerankRunResult {
        const attempt = run.Attempt;
        return {
            Success: attempt.success,
            ErrorMessage: attempt.success ? undefined : attempt.errorMessage,
            Response: attempt.Response,
            PromptRunID: promptRun.ID,
            ModelID: run.AnsweredBy.model.ID,
            ModelName: run.AnsweredBy.model.Name,
            DriverClass: run.AnsweredBy.driverClass,
            ExecutionTimeMS: executionTimeMS,
        };
    }

    /** A failed result for a request that never reached, or never finished, a model call. */
    private failedRunResult(
        errorMessage: string,
        startTime: Date,
        promptRun?: MJAIPromptRunEntityExtended,
        selected?: ModelVendorCandidate
    ): AIRerankRunResult {
        return {
            Success: false,
            ErrorMessage: errorMessage,
            PromptRunID: promptRun?.ID,
            ModelID: selected?.model.ID,
            ModelName: selected?.model.Name,
            DriverClass: selected?.driverClass,
            ExecutionTimeMS: new Date().getTime() - startTime.getTime(),
        };
    }

    /** The key format BaseModelRunner's failover credential cache uses. */
    private candidateKey(candidate: ModelVendorCandidate): string {
        return `${candidate.driverClass}:${candidate.model.ID}:${candidate.vendorId || 'default'}`;
    }

    /** Records which candidate was chosen and why, for the run row. */
    private buildSelectionInfo(
        prompt: MJAIPromptEntityExtended,
        candidates: ModelVendorCandidate[],
        selection: RerankSelection
    ): AIModelSelectionInfo {
        const info = new AIModelSelectionInfo();
        const selected = selection.Candidate;
        info.ModelSelected = selected.model;
        info.vendorSelected = selected.vendorId ? AIEngine.Instance.VendorsByID.get(NormalizeUUID(selected.vendorId)) : undefined;
        info.selectionStrategy = prompt.SelectionStrategy || 'Specific';
        info.SelectionReason = 'First candidate with available credentials';
        info.FallbackUsed = false;
        info.ModelsConsidered = candidates.map(c => {
            const available = selection.CredentialAvailability.get(this.candidateKey(c)) ?? false;
            return {
                model: c.model,
                vendor: c.vendorId ? AIEngine.Instance.VendorsByID.get(NormalizeUUID(c.vendorId)) : undefined,
                priority: c.priority,
                available,
                unavailableReason: available ? undefined : 'No credentials available',
            };
        });
        return info;
    }
}
