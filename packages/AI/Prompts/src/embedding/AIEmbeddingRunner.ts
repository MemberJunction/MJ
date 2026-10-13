import { MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseEntitySaveQueue, Metadata } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import {
  BaseEmbeddings,
  EmbedTextsResult,
  BaseResult,
  ErrorAnalyzer,
} from '@memberjunction/ai';
import {
  MJAIPromptEntityExtended,
  MJAIPromptRunEntityExtended,
  AIModelSelectionInfo,
  AIPromptParams,
  ModelInfo,
} from '@memberjunction/ai-core-plus';
import {
  BaseModelRunner,
  ModelVendorCandidate,
  FailoverConfiguration,
} from '../BaseModelRunner';
import {
  EmbeddingRunParams,
  EmbeddingRunResult,
} from './embedding-runner.types';

class EmbeddingInternalResult extends BaseResult {
  public EmbedResult?: EmbedTextsResult;
  public Vectors?: number[][];
  public TokensUsed?: number;
  public Cost?: number;

  constructor(success: boolean, startTime?: Date, endTime?: Date) {
    const start = startTime ?? new Date();
    const end = endTime ?? new Date();
    super(success, start, end);
  }
}

interface EmbeddingSelection {
  Candidate: ModelVendorCandidate;
  CredentialAvailability: Map<string, boolean>;
}

interface FailoverExecutionResult {
  result: EmbeddingInternalResult;
  answeredBy: ModelVendorCandidate;
}

/** The prompt a call runs under. */
interface ResolvedEmbeddingPrompt {
  Prompt: MJAIPromptEntityExtended;
  /**
   * False when no Embedding prompt exists and the call runs under an unsaved stand-in. No run row
   * is written then, because a run row's `PromptID` must reference a saved prompt.
   */
  IsSaved: boolean;
}

/** Everything a call needs once its prompt, candidates and selected candidate are known. */
interface EmbeddingPlan {
  Prompt: ResolvedEmbeddingPrompt;
  Candidates: ModelVendorCandidate[];
  PromptParams: AIPromptParams;
  Selection: EmbeddingSelection;
}

/** What exists so far in one call, so a failure at any point can finalize it. */
interface EmbeddingCallState {
  StartTime: Date;
  PromptRun: MJAIPromptRunEntityExtended | null;
  Candidate?: ModelVendorCandidate;
}

/**
 * Executes text embedding calls on `Embeddings`-type models with candidate selection,
 * credential resolution, failover, and `MJ: AI Prompt Runs` observability tracking.
 */
export class AIEmbeddingRunner extends BaseModelRunner {
  /**
   * Whether each driver class needs an API key, keyed by driver class. The answer is a property of
   * the class, so it can't change during a process, and finding it out means constructing the
   * driver. It is worked out once per process instead of on every call.
   */
  private static readonly keyRequirementByDriver = new Map<string, boolean>();

  constructor() {
    super();
    // With no Provider set, BaseModelRunner.Provider falls back to this: the global default.
    this._metadata = new Metadata(); // global-provider-ok: the fallback only; a caller's Provider (params or setter) always wins
  }

  public override get RequiredModelType(): string {
    return 'Embeddings';
  }

  protected override get DefaultLogCategory(): string {
    return 'AIEmbeddingRunner';
  }

  /**
   * Exposes the shared entity save queue so callers can monitor pending prompt run saves.
   */
  public get PromptRunQueue(): BaseEntitySaveQueue {
    return this._promptRunQueue;
  }

  /**
   * Awaits all in-flight prompt-run saves queued by this runner.
   */
  public override async WaitForPendingPromptRunSaves(): Promise<void> {
    await this._promptRunQueue.Flush();
  }

  /**
   * Embeds `params.Texts` and records the call as an `MJ: AI Prompt Runs` row.
   *
   * Which model answers:
   * - With `params.ModelID`, the only candidates are that model's vendors, so every vector comes
   *   from that model.
   * - Without it, the candidates come from the prompt. A prompt with `SelectionStrategy = 'Specific'`
   *   and `RequireSpecificModels` off (both shipped Embedding prompts) also lists every other active
   *   Embeddings model as a lower-priority fallback. So **an unpinned call may answer from any
   *   Embeddings model**: the first one with credentials, or the one failover moves to.
   *   `result.ModelID` names the model that answered.
   * - Failover follows the prompt's `FailoverStrategy`. `SameModelDifferentVendor` (the entity
   *   default) stays on the selected model and only tries its other vendors. `None` tries only the
   *   selected candidate. `NextBestModel` and `PowerRank` may move to another model.
   *
   * **Callers that compare the vectors with stored vectors** (a vector index, persisted tag vectors,
   * a cache) **must pass `ModelID`**. Vectors from different models are not comparable, even when
   * their dimensions match.
   *
   * Never throws: every failure returns an EmbeddingRunResult with `Success: false`.
   */
  public async RunEmbedding(params: EmbeddingRunParams): Promise<EmbeddingRunResult> {
    const call: EmbeddingCallState = { StartTime: new Date(), PromptRun: null };
    const invalid = this.validateParams(params);
    if (invalid) {
      return this.failedResult(invalid, call.StartTime);
    }
    try {
      return await this.runEmbedding(params, call);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return this.failCall(message, call, call.Candidate);
    }
  }

  private async runEmbedding(params: EmbeddingRunParams, call: EmbeddingCallState): Promise<EmbeddingRunResult> {
    await AIEngine.Instance.Config(false, params.ContextUser);

    const plan = await this.planEmbedding(params);
    if (typeof plan === 'string') {
      return this.failedResult(plan, call.StartTime);
    }
    call.Candidate = plan.Selection.Candidate;
    call.PromptRun = await this.startRunRecord(plan, params, call.StartTime);

    const { result, answeredBy } = await this.executeEmbeddingWithFailover(
      plan.Prompt.Prompt,
      plan.PromptParams,
      plan.Candidates,
      plan.Selection,
      params,
      call.PromptRun
    );
    if (!result.success) {
      return this.failCall(result.errorMessage ?? 'Embedding execution failed', call, answeredBy);
    }
    const endTime = new Date();
    const executionTimeMS = endTime.getTime() - call.StartTime.getTime();
    if (call.PromptRun) {
      await this.finalizeSuccessRun(call.PromptRun, result, endTime, executionTimeMS);
    }
    return this.successResult(result, answeredBy, call.PromptRun, executionTimeMS);
  }

  /** Resolves the prompt, builds the candidates and selects the first one with credentials. Returns an error message on failure. */
  private async planEmbedding(params: EmbeddingRunParams): Promise<EmbeddingPlan | string> {
    const prompt = await this.resolvePrompt(params);
    if (typeof prompt === 'string') {
      return prompt;
    }
    const candidates = this.buildCandidates(prompt.Prompt, params);
    if (typeof candidates === 'string') {
      return candidates;
    }
    const promptParams = this.createPromptParams(prompt.Prompt, params);
    const selection = this.selectCandidate(prompt.Prompt, candidates, promptParams);
    if (typeof selection === 'string') {
      return selection;
    }
    return { Prompt: prompt, Candidates: candidates, PromptParams: promptParams, Selection: selection };
  }

  /** Writes the run row, unless the caller opted out or the prompt is the unsaved stand-in. */
  private async startRunRecord(
    plan: EmbeddingPlan,
    params: EmbeddingRunParams,
    startTime: Date
  ): Promise<MJAIPromptRunEntityExtended | null> {
    if (params.SkipRunRecord || !plan.Prompt.IsSaved) {
      return null;
    }
    const selectionInfo = this.buildSelectionInfo(plan.Prompt.Prompt, plan.Candidates, plan.Selection);
    return this.createEmbeddingRunRecord(
      plan.Prompt.Prompt,
      plan.Selection.Candidate,
      plan.PromptParams,
      params,
      startTime,
      selectionInfo
    );
  }

  /** Finalizes the run row (when there is one) as failed and returns the failure. */
  private async failCall(
    errorMessage: string,
    call: EmbeddingCallState,
    candidate?: ModelVendorCandidate
  ): Promise<EmbeddingRunResult> {
    if (call.PromptRun) {
      const endTime = new Date();
      await this.finalizeFailedRun(call.PromptRun, errorMessage, endTime, endTime.getTime() - call.StartTime.getTime());
    }
    return this.failedResult(errorMessage, call.StartTime, call.PromptRun, candidate);
  }

  private validateParams(params: EmbeddingRunParams): string | undefined {
    if (!params?.Texts || params.Texts.length === 0) {
      return 'No texts provided for embedding';
    }
    if (!params?.ContextUser) {
      return 'ContextUser is required';
    }
    return undefined;
  }

  private createPromptParams(prompt: MJAIPromptEntityExtended, params: EmbeddingRunParams): AIPromptParams {
    const promptParams = new AIPromptParams();
    promptParams.prompt = prompt;
    promptParams.contextUser = params.ContextUser;
    promptParams.parentPromptRunId = params.ParentRunID;
    promptParams.provider = params.Provider ?? this._provider ?? undefined;
    return promptParams;
  }

  /**
   * The prompt the call runs under: `params.PromptID` when given, else the first active Embedding
   * prompt, else an unsaved stand-in (see {@link createStandInPrompt}).
   */
  private async resolvePrompt(params: EmbeddingRunParams): Promise<ResolvedEmbeddingPrompt | string> {
    if (params.PromptID) {
      const named = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, params.PromptID));
      return named ? { Prompt: named, IsSaved: true } : `Prompt '${params.PromptID}' was not found`;
    }
    const configured = this.findEmbeddingPrompt();
    if (configured) {
      return { Prompt: configured, IsSaved: true };
    }
    return { Prompt: await this.createStandInPrompt(params), IsSaved: false };
  }

  private findEmbeddingPrompt(): MJAIPromptEntityExtended | undefined {
    const requiredTypeId = this.tryRequiredModelTypeID();
    return AIEngine.Instance.Prompts.find(
      p => p.Status === 'Active' && (
        p.Type?.toLowerCase() === 'embedding' ||
        (requiredTypeId !== undefined && UUIDsEqual(p.AIModelTypeID, requiredTypeId))
      )
    );
  }

  /** The Embeddings model type's ID, or undefined when the catalog doesn't have that type yet. */
  private tryRequiredModelTypeID(): string | undefined {
    try {
      return this.RequiredModelTypeID();
    } catch {
      return undefined;
    }
  }

  /**
   * An unsaved `MJ: AI Prompts` entity for installs with no active Embedding prompt. Candidate
   * building, failover and retries all read their settings from a prompt, so the call runs under
   * this one, which carries the entity's default settings. A pinned call (the usual case: vector
   * sync, dupe detection, vector search) still runs on the pinned model only. The stand-in is never
   * saved, and no run row is written for it.
   */
  private async createStandInPrompt(params: EmbeddingRunParams): Promise<MJAIPromptEntityExtended> {
    const provider = params.Provider ?? this._provider ?? Metadata.Provider;
    const prompt = await provider.GetEntityObject<MJAIPromptEntityExtended>('MJ: AI Prompts', params.ContextUser);
    prompt.Name = 'Embedding (no Embedding prompt configured)';
    prompt.FailoverStrategy = 'SameModelDifferentVendor';
    return prompt;
  }

  private buildCandidates(
    prompt: MJAIPromptEntityExtended,
    params: EmbeddingRunParams
  ): ModelVendorCandidate[] | string {
    try {
      const candidates = this.BuildModelVendorCandidates(
        prompt,
        params.ModelID,
        undefined,
        undefined,
        false
      );
      return candidates.length > 0
        ? candidates
        : `No Embeddings model candidates found for prompt '${prompt.Name}'`;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  private selectCandidate(
    prompt: MJAIPromptEntityExtended,
    candidates: ModelVendorCandidate[],
    promptParams: AIPromptParams
  ): EmbeddingSelection | string {
    const credentialAvailability = new Map<string, boolean>();
    let selected: ModelVendorCandidate | undefined;
    for (const candidate of candidates) {
      const available = this.HasCredentialsAvailable(
        candidate.driverClass,
        prompt.ID,
        candidate.model.ID,
        candidate.vendorId,
        promptParams
      );
      credentialAvailability.set(this.candidateKey(candidate), available);
      if (available && !selected) {
        selected = candidate;
      }
    }
    if (!selected) {
      const summary = candidates
        .map(c => `[Model: ${c.model.Name}, Vendor: ${c.vendorName ?? 'default'}, Driver: ${c.driverClass}]`)
        .join(', ');
      return `No Embeddings model has credentials available for prompt '${prompt.Name}'. Candidates: ${summary}`;
    }
    return { Candidate: selected, CredentialAvailability: credentialAvailability };
  }

  /**
   * A candidate whose driver needs no API key ({@link BaseEmbeddings.RequiresAPIKey} is `false`,
   * e.g. `LocalEmbedding`) counts as credentialed with no key, binding or credential configured.
   * Every other candidate goes through the base check. This is decided by the driver, not by the
   * vendor's `CredentialTypeID`: several vendors that do need keys leave that column empty.
   */
  protected override HasCredentialsAvailable(
    driverClass: string,
    promptId: string | undefined,
    modelId: string | undefined,
    vendorId: string | undefined,
    params?: AIPromptParams
  ): boolean {
    return super.HasCredentialsAvailable(driverClass, promptId, modelId, vendorId, params)
      || !this.driverRequiresAPIKey(driverClass);
  }

  private driverRequiresAPIKey(driverClass: string): boolean {
    let requires = AIEmbeddingRunner.keyRequirementByDriver.get(driverClass);
    if (requires === undefined) {
      requires = this.probeDriverRequiresAPIKey(driverClass);
      AIEmbeddingRunner.keyRequirementByDriver.set(driverClass, requires);
    }
    return requires;
  }

  /**
   * Builds the driver with no key, the way a keyless call would, and asks it. A driver that can't
   * be resolved, or whose constructor throws without a key, is treated as needing one.
   */
  private probeDriverRequiresAPIKey(driverClass: string): boolean {
    try {
      return this.createDriver(driverClass, '')?.RequiresAPIKey ?? true;
    } catch {
      return true;
    }
  }

  /** Creates the driver through the ClassFactory. Returns null when no subclass is registered for the key. */
  private createDriver(driverClass: string, apiKey: string): BaseEmbeddings | null {
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseEmbeddings>(BaseEmbeddings, driverClass, apiKey);
    return driver && driver.constructor !== BaseEmbeddings ? driver : null;
  }

  private candidateKey(candidate: ModelVendorCandidate): string {
    return `${candidate.driverClass}:${candidate.model.ID}:${candidate.vendorId || 'default'}`;
  }

  private buildSelectionInfo(
    prompt: MJAIPromptEntityExtended,
    candidates: ModelVendorCandidate[],
    selection: EmbeddingSelection
  ): AIModelSelectionInfo {
    const info = new AIModelSelectionInfo();
    const selected = selection.Candidate;
    info.ModelSelected = selected.model;
    info.vendorSelected = selected.vendorId
      ? AIEngine.Instance.VendorsByID.get(NormalizeUUID(selected.vendorId))
      : undefined;
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

  private async createEmbeddingRunRecord(
    prompt: MJAIPromptEntityExtended,
    selected: ModelVendorCandidate,
    promptParams: AIPromptParams,
    params: EmbeddingRunParams,
    startTime: Date,
    selectionInfo: AIModelSelectionInfo
  ): Promise<MJAIPromptRunEntityExtended | null> {
    try {
      return await this.CreateRunRecord(
        prompt,
        selected.model,
        promptParams,
        startTime,
        selected.vendorId,
        selectionInfo,
        run => {
          if (params.ParentRunID) {
            run.ParentID = params.ParentRunID;
          }
          if (params.Description) {
            run.Messages = JSON.stringify({
              description: params.Description,
              textCount: params.Texts.length,
              totalChars: params.Texts.reduce((sum, t) => sum + t.length, 0),
            });
          }
        }
      );
    } catch {
      return null;
    }
  }

  private async executeEmbeddingWithFailover(
    prompt: MJAIPromptEntityExtended,
    promptParams: AIPromptParams,
    candidates: ModelVendorCandidate[],
    selection: EmbeddingSelection,
    params: EmbeddingRunParams,
    promptRun: MJAIPromptRunEntityExtended | null
  ): Promise<FailoverExecutionResult> {
    let answeredBy = selection.Candidate;
    const attempt = async (candidate: ModelVendorCandidate): Promise<EmbeddingInternalResult> => {
      answeredBy = candidate;
      return this.executeOnCandidate(candidate, prompt, promptParams, params);
    };
    const failoverConfig = this.getFailoverConfiguration(prompt);
    const result = await this.ExecuteWithFailover<EmbeddingInternalResult>(
      prompt,
      promptParams,
      this.failoverCandidates(failoverConfig.strategy, candidates, selection.Candidate),
      failoverConfig,
      attempt,
      (lastError: Error | null) => this.allCandidatesFailedResult(lastError),
      promptRun ?? undefined,
      selection.CredentialAvailability
    );
    return { result, answeredBy };
  }

  /**
   * The candidates a call may fail over to, following the prompt's `FailoverStrategy`:
   * - `SameModelDifferentVendor`: only the selected model's vendors. Moving to another model would
   *   return vectors from a different vector space, often with a different dimension.
   * - `None`: only the selected candidate.
   * - `NextBestModel`, `PowerRank`: every candidate, unchanged.
   *
   * `BaseModelRunner.ExecuteWithFailover` walks the list it is given without applying the strategy.
   * The narrowing is done here, not in the base, because the chat runner relies on the base's
   * current behavior.
   */
  private failoverCandidates(
    strategy: FailoverConfiguration['strategy'],
    candidates: ModelVendorCandidate[],
    selected: ModelVendorCandidate
  ): ModelVendorCandidate[] {
    switch (strategy) {
      case 'SameModelDifferentVendor':
        return candidates.filter(c => UUIDsEqual(c.model.ID, selected.model.ID));
      case 'None':
        return [selected];
      default:
        return candidates;
    }
  }

  private allCandidatesFailedResult(lastError: Error | null): EmbeddingInternalResult {
    const errRes = new EmbeddingInternalResult(false);
    errRes.errorMessage = lastError?.message ?? 'All embedding candidates failed';
    errRes.errorInfo = { errorType: 'ModelError', severity: 'Retriable', canFailover: false };
    errRes.exception = lastError ?? undefined;
    return errRes;
  }

  private async executeOnCandidate(
    candidate: ModelVendorCandidate,
    prompt: MJAIPromptEntityExtended,
    promptParams: AIPromptParams,
    params: EmbeddingRunParams
  ): Promise<EmbeddingInternalResult> {
    const startTime = new Date();
    let apiKey = '';
    try {
      apiKey = await this.ResolveCredentialForExecution(
        candidate.driverClass,
        prompt.ID,
        candidate.model.ID,
        candidate.vendorId,
        promptParams
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const res = new EmbeddingInternalResult(false, startTime, new Date());
      res.errorMessage = error.message;
      res.errorInfo = { errorType: 'Authentication', severity: 'Retriable', canFailover: true };
      res.exception = error;
      return res;
    }

    const embeddingInstance = this.createDriver(candidate.driverClass, apiKey);
    if (!embeddingInstance) {
      const res = new EmbeddingInternalResult(false, startTime, new Date());
      res.errorMessage = `Failed to create BaseEmbeddings driver for '${candidate.driverClass}'`;
      res.errorInfo = { errorType: 'ModelError', severity: 'Retriable', canFailover: true };
      return res;
    }

    try {
      const embedResult = await embeddingInstance.EmbedTexts({
        texts: params.Texts,
        model: candidate.apiName,
        dimensions: params.Dimensions,
      });

      if (!embedResult || !embedResult.vectors || embedResult.vectors.length === 0) {
        const res = new EmbeddingInternalResult(false, startTime, new Date());
        res.errorMessage = `No vectors returned from embedding model '${candidate.model.Name}'`;
        res.errorInfo = { errorType: 'ModelError', severity: 'Retriable', canFailover: true };
        return res;
      }

      const res = new EmbeddingInternalResult(true, startTime, new Date());
      res.EmbedResult = embedResult;
      res.Vectors = embedResult.vectors;
      res.TokensUsed = embedResult.ModelUsage?.totalTokens ?? 0;
      res.Cost = embedResult.ModelUsage?.cost ?? 0;
      return res;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      const errorInfo = ErrorAnalyzer.analyzeError(error);
      const res = new EmbeddingInternalResult(false, startTime, new Date());
      res.errorMessage = error.message;
      res.errorInfo = errorInfo;
      res.exception = error;
      return res;
    }
  }

  private async finalizeSuccessRun(
    promptRun: MJAIPromptRunEntityExtended,
    execResult: EmbeddingInternalResult,
    endTime: Date,
    executionTimeMS: number
  ): Promise<void> {
    await this.FinalizeRunRecord(promptRun, true, endTime, executionTimeMS, run => {
      if (execResult.EmbedResult?.ModelUsage) {
        const u = execResult.EmbedResult.ModelUsage;
        run.TokensPrompt = u.promptTokens ?? 0;
        run.TokensCompletion = u.completionTokens ?? 0;
        run.TokensUsed = u.totalTokens ?? 0;
        run.TokensCacheRead = u.cacheReadTokens ?? 0;
        run.TokensCacheWrite = u.cacheWriteTokens ?? 0;
        run.Cost = u.cost ?? 0;
        run.CostCurrency = u.costCurrency ?? 'USD';
        run.QueueTime = u.queueTime ?? 0;
        run.PromptTime = u.promptTime ?? 0;
        run.CompletionTime = u.completionTime ?? 0;
      }
      run.Result = JSON.stringify({
        vectorCount: execResult.Vectors?.length ?? 0,
        dimensions: execResult.Vectors?.[0]?.length ?? 0,
      });
    });
  }

  private async finalizeFailedRun(
    promptRun: MJAIPromptRunEntityExtended,
    errorMessage: string,
    endTime: Date,
    executionTimeMS: number
  ): Promise<void> {
    await this.FinalizeRunRecord(promptRun, false, endTime, executionTimeMS, run => {
      run.ErrorMessage = errorMessage;
    });
  }

  private successResult(
    execResult: EmbeddingInternalResult,
    answeredBy: ModelVendorCandidate,
    promptRun: MJAIPromptRunEntityExtended | null,
    executionTimeMs: number
  ): EmbeddingRunResult {
    const modelInfo = this.buildModelInfo(answeredBy);
    return {
      Success: true,
      Vectors: execResult.Vectors ?? [],
      PromptRunID: promptRun?.ID ?? null,
      TokensUsed: execResult.TokensUsed ?? 0,
      Cost: execResult.Cost ?? 0,
      ErrorMessage: null,
      ExecutionTimeMs: executionTimeMs,
      ModelID: answeredBy?.model.ID,
      ModelName: answeredBy?.model.Name,
      ModelInfo: modelInfo,
    };
  }

  private failedResult(
    errorMessage: string,
    startTime: Date,
    promptRun?: MJAIPromptRunEntityExtended | null,
    candidate?: ModelVendorCandidate
  ): EmbeddingRunResult {
    const executionTimeMs = new Date().getTime() - startTime.getTime();
    const modelInfo = this.buildModelInfo(candidate);
    return {
      Success: false,
      Vectors: [],
      PromptRunID: promptRun?.ID ?? null,
      TokensUsed: 0,
      Cost: 0,
      ErrorMessage: errorMessage,
      ExecutionTimeMs: executionTimeMs,
      ModelID: candidate?.model.ID,
      ModelName: candidate?.model.Name,
      ModelInfo: modelInfo,
    };
  }

  private buildModelInfo(candidate?: ModelVendorCandidate): ModelInfo | undefined {
    if (!candidate) {
      return undefined;
    }
    return {
      modelId: candidate.model.ID,
      modelName: candidate.model.Name,
      vendorId: candidate.vendorId,
      vendorName: candidate.vendorName,
      powerRank: candidate.model.PowerRank,
      modelType: this.RequiredModelType,
    };
  }
}
