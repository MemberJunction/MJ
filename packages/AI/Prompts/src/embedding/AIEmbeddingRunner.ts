import { MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { BaseEntitySaveQueue, Metadata, IMetadataProvider } from '@memberjunction/core';
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
  FailoverAttempt,
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

  private _providerOverride: IMetadataProvider | null = null;

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
   * Optional metadata provider override.
   */
  public get Provider(): IMetadataProvider {
    return this._providerOverride ?? (new Metadata() as unknown as IMetadataProvider);
  }

  public set Provider(value: IMetadataProvider | null) {
    this._providerOverride = value;
  }

  /**
   * Awaits all in-flight prompt-run saves queued by this runner.
   */
  public override async WaitForPendingPromptRunSaves(): Promise<void> {
    await this._promptRunQueue.Flush();
  }

  /**
   * Executes an embedding call with full AIPromptRun tracking and candidate failover.
   * Never throws: every failure returns an EmbeddingRunResult with Success: false.
   */
  public async RunEmbedding(params: EmbeddingRunParams): Promise<EmbeddingRunResult> {
    const startTime = new Date();
    let promptRun: MJAIPromptRunEntityExtended | null = null;
    let selected: ModelVendorCandidate | undefined;

    try {
      const invalid = this.validateParams(params);
      if (invalid) {
        return this.failedResult(invalid, startTime, promptRun, selected);
      }

      await AIEngine.Instance.Config(false, params.ContextUser);

      const promptOrError = this.resolvePrompt(params);
      if (typeof promptOrError === 'string') {
        return this.failedResult(promptOrError, startTime, promptRun, selected);
      }
      const prompt = promptOrError;

      const candidatesOrError = this.buildCandidates(prompt, params);
      if (typeof candidatesOrError === 'string') {
        return this.failedResult(candidatesOrError, startTime, promptRun, selected);
      }
      const candidates = candidatesOrError;

      const promptParams = this.createPromptParams(prompt, params);
      const selectionOrError = this.selectCandidate(prompt, candidates, promptParams);
      if (typeof selectionOrError === 'string') {
        return this.failedResult(selectionOrError, startTime, promptRun, selected);
      }
      const selection = selectionOrError;
      selected = selection.Candidate;

      const selectionInfo = this.buildSelectionInfo(prompt, candidates, selection);
      promptRun = await this.createEmbeddingRunRecord(prompt, selected, promptParams, params, startTime, selectionInfo);

      const { result: execResult, answeredBy } = await this.executeEmbeddingWithFailover(
        prompt,
        promptParams,
        candidates,
        selection,
        params,
        promptRun
      );
      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();

      if (execResult.success) {
        if (promptRun) {
          await this.finalizeSuccessRun(promptRun, execResult, endTime, executionTimeMS);
        }
        return this.successResult(execResult, answeredBy, promptRun, executionTimeMS);
      }

      if (promptRun) {
        await this.finalizeFailedRun(promptRun, execResult.errorMessage ?? 'Embedding execution failed', endTime, executionTimeMS);
      }
      return this.failedResult(execResult.errorMessage ?? 'Embedding execution failed', startTime, promptRun, answeredBy);

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();
      if (promptRun) {
        await this.finalizeFailedRun(promptRun, message, endTime, executionTimeMS);
      }
      return this.failedResult(message, startTime, promptRun, selected);
    }
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
    promptParams.provider = params.Provider ?? this._providerOverride ?? undefined;
    return promptParams;
  }

  private resolvePrompt(params: EmbeddingRunParams): MJAIPromptEntityExtended | string {
    if (params.PromptID) {
      const found = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, params.PromptID));
      if (!found) {
        return `Prompt '${params.PromptID}' was not found`;
      }
      return found;
    }

    let requiredTypeId = '';
    try {
      requiredTypeId = this.RequiredModelTypeID();
    } catch {
      // Catalog may not have Embeddings type registered yet
    }

    const prompt = AIEngine.Instance.Prompts.find(
      p => p.Status === 'Active' && (
        p.Type?.toLowerCase() === 'embedding' ||
        (requiredTypeId && UUIDsEqual(p.AIModelTypeID, requiredTypeId))
      )
    );
    if (prompt) {
      return prompt;
    }

    return {
      ID: '00000000-0000-0000-0000-000000000000',
      Name: 'Default Embedding',
      Status: 'Active',
      SelectionStrategy: 'Default',
      AIModelTypeID: requiredTypeId,
      FailoverStrategy: 'NextInList',
      MaxFailoverAttempts: 3,
      PromptModels: [],
      ModelVendors: [],
    } as unknown as MJAIPromptEntityExtended;
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
    const result = failoverConfig.strategy === 'None'
      ? await attempt(selection.Candidate)
      : await this.ExecuteWithFailover<EmbeddingInternalResult>(
          prompt,
          promptParams,
          candidates,
          failoverConfig,
          attempt,
          (lastError: Error, _failoverAttempts: FailoverAttempt[]) => {
            const errRes = new EmbeddingInternalResult(false);
            errRes.errorMessage = lastError?.message ?? 'All embedding candidates failed';
            errRes.errorInfo = { errorType: 'ModelError', severity: 'Retriable', canFailover: false };
            errRes.exception = lastError;
            return errRes;
          },
          promptRun ?? undefined,
          selection.CredentialAvailability
        );
    return { result, answeredBy };
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
      modelInfo: modelInfo,
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
      modelInfo: modelInfo,
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
