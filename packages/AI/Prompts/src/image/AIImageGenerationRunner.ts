/**
 * @fileoverview Runner for image generation and editing on `Image Generator` models.
 *
 * @module @memberjunction/ai-prompts
 */

import { MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import {
  AIErrorType,
  BaseImageGenerator,
  BuildCancellationErrorInfo,
  ErrorAnalyzer,
  ImageEditParams,
  ImageGenerationParams,
  ImageGenerationResult,
  ModelUsage,
} from '@memberjunction/ai';
import {
  AIModelSelectionInfo,
  AIPromptParams,
  MJAIPromptEntityExtended,
  MJAIPromptRunEntityExtended,
} from '@memberjunction/ai-core-plus';
import {
  BaseModelRunner,
  ExecutionBound,
  FailoverAttempt,
  ModelVendorCandidate,
} from '../BaseModelRunner';
import {
  AIImageEditRunParams,
  AIImageGenerationRunParams,
  AIImageRunOptions,
  AIImageRunResult,
} from './image-runner.types';

/** The params of either operation. */
type ImageRunParams = AIImageGenerationRunParams | AIImageEditRunParams;

/** One image operation: its name for the run row, and the driver call it makes. */
interface ImageOperation {
  Name: 'Generate' | 'Edit';
  /** Why the params cannot run this operation, beyond the checks every operation shares. */
  Invalid?: string;
  /**
   * Calls the driver, with `model` set to the candidate's API name and `CancellationToken` to the
   * call's bound signal.
   */
  Invoke: (driver: BaseImageGenerator, model: string, signal: AbortSignal | undefined) => Promise<ImageGenerationResult>;
}

/** The driver's result, and the candidate that produced it (after any failover). */
interface ImageRun {
  Result: ImageGenerationResult;
  AnsweredBy: ModelVendorCandidate;
}

/** The candidate selected for a call, with the credential probes made while selecting it. */
interface ImageSelection {
  Candidate: ModelVendorCandidate;
  CredentialAvailability: Map<string, boolean>;
}

/**
 * Runs image generation and editing on `Image Generator` models. It does for an image call what
 * `AIPromptRunner` does for a chat call: selects a model from the carrier prompt's bindings (or the
 * pinned `ModelID`), resolves credentials, fails over, and writes an `MJ: AI Prompt Runs` row.
 *
 * The row never holds image bytes: `Messages` records the prompt text and the image count, and
 * `Result` the count and sizes of the images. Usage is the driver's when it reports a quantity;
 * otherwise the images returned are counted in the `Images` measure, so the model's `Per Image`
 * cost row prices the run when the row saves. The runner never sets a cost itself.
 *
 * Each driver call is bounded by the caller's `TimeoutMS` and `CancellationToken`, composed as for a
 * chat call, and the driver is handed the bound's signal so an abort tears its request down. A call
 * that times out fails over; a call the caller cancelled does not, and its run row is recorded as
 * `Cancelled`.
 */
export class AIImageGenerationRunner extends BaseModelRunner {
  /** The carrier prompt used when the caller names none. */
  public static readonly DEFAULT_PROMPT_NAME = 'Default Image Generation';

  /** Image calls run only on `Image Generator` models. */
  public override get RequiredModelType(): string {
    return 'Image Generator';
  }

  protected override get DefaultLogCategory(): string {
    return 'AIImageGenerationRunner';
  }

  /**
   * Generates images from a text prompt (`BaseImageGenerator.GenerateImage`). Never throws: every
   * failure is a result with `Success: false` and an `ErrorMessage`.
   */
  public async RunImageGeneration(params: AIImageGenerationRunParams): Promise<AIImageRunResult> {
    return this.runOperation(params, {
      Name: 'Generate',
      Invoke: (driver, model, signal) => driver.GenerateImage({ ...this.driverParams<ImageGenerationParams>(params), model, CancellationToken: signal }),
    });
  }

  /**
   * Edits a source image with a text prompt and an optional mask (`BaseImageGenerator.EditImage`).
   * Never throws: every failure is a result with `Success: false` and an `ErrorMessage`.
   */
  public async RunImageEdit(params: AIImageEditRunParams): Promise<AIImageRunResult> {
    return this.runOperation(params, {
      Name: 'Edit',
      Invalid: params?.image ? undefined : 'A source image is required (params.image)',
      Invoke: (driver, model, signal) => driver.EditImage({ ...this.driverParams<ImageEditParams>(params), model, CancellationToken: signal }),
    });
  }

  /**
   * The shared lifecycle: validate, choose the carrier prompt and candidates, create the run row,
   * call the driver with failover, then finalize the row. An exception after the row exists
   * finalizes it as failed, so it never stays 'Running'.
   */
  private async runOperation(params: ImageRunParams, operation: ImageOperation): Promise<AIImageRunResult> {
    const startTime = new Date();
    let promptRun: MJAIPromptRunEntityExtended | undefined;
    let selected: ModelVendorCandidate | undefined;
    try {
      const invalid = this.validateParams(params, operation);
      if (invalid) {
        return this.failedRunResult(invalid, startTime);
      }
      await AIEngine.Instance.Config(false, params.ContextUser);
      const prompt = this.resolvePrompt(params.PromptID);
      if (typeof prompt === 'string') {
        return this.failedRunResult(prompt, startTime);
      }
      const promptParams = this.buildPromptParams(params, prompt);
      const candidates = this.buildCandidates(prompt, params.ModelID, promptParams);
      if (typeof candidates === 'string') {
        return this.failedRunResult(candidates, startTime);
      }
      const selection = this.selectCandidate(prompt, candidates, promptParams);
      if (typeof selection === 'string') {
        return this.failedRunResult(selection, startTime);
      }
      selected = selection.Candidate;
      const selectionInfo = this.buildSelectionInfo(prompt, candidates, selection);
      promptRun = await this.CreateRunRecord(prompt, selected.model, promptParams, startTime, selected.vendorId, selectionInfo, run => {
        run.Messages = this.describeRequest(params, operation);
      });
      const run = await this.runOnCandidates(prompt, promptParams, candidates, selection, operation, promptRun);
      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();
      await this.finalizeImageRun(promptRun, run.Result, endTime, executionTimeMS);
      return this.buildRunResult(run, promptRun, executionTimeMS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (promptRun) {
        await this.finalizeFailedRun(promptRun, message, startTime);
      }
      return this.failedRunResult(message, startTime, promptRun, selected);
    }
  }

  /** Returns an error message when the request cannot run, otherwise undefined. */
  private validateParams(params: ImageRunParams, operation: ImageOperation): string | undefined {
    if (!params) {
      return 'Image run parameters are required';
    }
    if (!params.prompt || params.prompt.trim().length === 0) {
      return 'Image prompt text is required (params.prompt)';
    }
    if (operation.Invalid) {
      return operation.Invalid;
    }
    return params.CancellationToken?.aborted ? 'The Image Generator call was cancelled before it started' : undefined;
  }

  /** The carrier prompt named by `PromptID`, or the default one by name; otherwise why it is missing. */
  private resolvePrompt(promptId: string | undefined): MJAIPromptEntityExtended | string {
    if (promptId) {
      const byId = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, promptId));
      return byId ?? `Image generation prompt ${promptId} was not found`;
    }
    const target = AIImageGenerationRunner.DEFAULT_PROMPT_NAME.toLowerCase();
    const byName = AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target);
    return byName ?? `The '${AIImageGenerationRunner.DEFAULT_PROMPT_NAME}' prompt was not found. Push the prompt metadata, or pass PromptID.`;
  }

  /**
   * The base runner reads its settings from `AIPromptParams`, so the image params are mapped onto
   * one: the carrier prompt, the context user, the keys and credential scope, the parent run, the agent and its
   * run-created hook, the timeout and cancellation token, and the runner's provider.
   */
  private buildPromptParams(params: ImageRunParams, prompt: MJAIPromptEntityExtended): AIPromptParams {
    const promptParams = new AIPromptParams();
    promptParams.prompt = prompt;
    promptParams.contextUser = params.ContextUser;
    promptParams.apiKeys = params.APIKeys;
    promptParams.CredentialScope = params.CredentialScope;
    promptParams.parentPromptRunId = params.ParentRunID;
    promptParams.agentId = params.AgentID;
    promptParams.onPromptRunCreated = params.OnPromptRunCreated;
    promptParams.timeoutMS = params.TimeoutMS;
    promptParams.cancellationToken = params.CancellationToken;
    if (this._provider) {
      promptParams.provider = this._provider;
    }
    return promptParams;
  }

  /** Builds the candidates, or returns the reason there are none. The type floor throws here. */
  private buildCandidates(
    prompt: MJAIPromptEntityExtended,
    modelId: string | undefined,
    promptParams: AIPromptParams
  ): ModelVendorCandidate[] | string {
    try {
      const candidates = this.BuildModelVendorCandidates(prompt, modelId, undefined, undefined, promptParams.verbose);
      return candidates.length > 0 ? candidates : `No Image Generator model candidates found for prompt '${prompt.Name}'`;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /** Selects the first candidate with credentials, or returns an error listing every candidate. */
  private selectCandidate(
    prompt: MJAIPromptEntityExtended,
    candidates: ModelVendorCandidate[],
    promptParams: AIPromptParams
  ): ImageSelection | string {
    const credentialAvailability = new Map<string, boolean>();
    let selected: ModelVendorCandidate | undefined;
    for (const candidate of candidates) {
      const available = this.HasCredentialsAvailable(candidate.driverClass, prompt.ID, candidate.model.ID, candidate.vendorId, promptParams);
      credentialAvailability.set(this.candidateKey(candidate), available);
      if (available && !selected) {
        selected = candidate;
      }
    }
    if (!selected) {
      const summary = candidates
        .map(c => `[Model: ${c.model.Name}, Vendor: ${c.vendorName ?? 'default'}, Driver: ${c.driverClass}]`)
        .join(', ');
      return `No Image Generator model has credentials available for prompt '${prompt.Name}'. Candidates: ${summary}`;
    }
    return { Candidate: selected, CredentialAvailability: credentialAvailability };
  }

  /**
   * Runs the selected candidate alone when failover is off, otherwise the base failover loop. Tracks
   * the candidate that produced the result, so the caller reports the model that actually answered.
   */
  private async runOnCandidates(
    prompt: MJAIPromptEntityExtended,
    promptParams: AIPromptParams,
    candidates: ModelVendorCandidate[],
    selection: ImageSelection,
    operation: ImageOperation,
    promptRun: MJAIPromptRunEntityExtended
  ): Promise<ImageRun> {
    let answeredBy = selection.Candidate;
    const attempt = (candidate: ModelVendorCandidate): Promise<ImageGenerationResult> => {
      answeredBy = candidate;
      return this.executeOnCandidate(candidate, prompt, promptParams, operation);
    };
    const failoverConfig = this.getFailoverConfiguration(prompt);
    const result = failoverConfig.strategy === 'None'
      ? await attempt(selection.Candidate)
      : await this.ExecuteWithFailover<ImageGenerationResult>(
          prompt,
          promptParams,
          candidates,
          failoverConfig,
          attempt,
          (err, attempts) => this.createFailoverErrorResult(err, attempts),
          promptRun,
          selection.CredentialAvailability
        );
    return { Result: result, AnsweredBy: answeredBy };
  }

  /**
   * Makes the call on one candidate: resolves its credential, builds its driver, and calls it. A
   * caller that cancelled while an earlier candidate ran gets no further calls.
   */
  private async executeOnCandidate(
    candidate: ModelVendorCandidate,
    prompt: MJAIPromptEntityExtended,
    promptParams: AIPromptParams,
    operation: ImageOperation
  ): Promise<ImageGenerationResult> {
    if (promptParams.cancellationToken?.aborted) {
      return this.cancelledImage();
    }
    let apiKey: string;
    try {
      apiKey = await this.ResolveCredentialForExecution(candidate.driverClass, prompt.ID, candidate.model.ID, candidate.vendorId, promptParams);
    } catch (err: unknown) {
      return this.failedImage(err instanceof Error ? err.message : String(err), 'Authentication');
    }
    const driver = this.createDriver(candidate, apiKey);
    if (typeof driver === 'string') {
      return this.failedImage(driver, 'ModelError');
    }
    return this.callDriver(driver, candidate, prompt, promptParams, operation);
  }

  /** Builds the candidate's driver through the ClassFactory, or returns why it cannot be built. */
  private createDriver(candidate: ModelVendorCandidate, apiKey: string): BaseImageGenerator | string {
    const driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseImageGenerator>(BaseImageGenerator, candidate.driverClass, apiKey);
    if (!driver || driver.constructor === BaseImageGenerator) {
      return `No image generator is registered for driver class '${candidate.driverClass}'`;
    }
    return driver;
  }

  /**
   * Calls the driver within the call's bound: the caller's timeout and cancellation token, composed
   * as for a chat call. The driver is handed the bound's signal, so an abort tears its request down.
   * A driver that throws gets the vendor's own error classification; a timeout reads as a network
   * error, so it fails over. A call the caller cancelled is never failed over.
   */
  private async callDriver(
    driver: BaseImageGenerator,
    candidate: ModelVendorCandidate,
    prompt: MJAIPromptEntityExtended,
    promptParams: AIPromptParams,
    operation: ImageOperation
  ): Promise<ImageGenerationResult> {
    const bound = this.createExecutionBound(prompt, promptParams, promptParams.cancellationToken);
    try {
      const result = await this.RaceWithinBound(operation.Invoke(driver, this.apiNameFor(candidate), bound.Signal), bound, prompt);
      if (!result) {
        return this.failedImage(`The image generator '${candidate.driverClass}' returned no result`, 'ModelError');
      }
      return !result.success && this.callerCancelled(bound) ? this.cancelledImage() : result;
    } catch (err: unknown) {
      if (this.callerCancelled(bound)) {
        return this.cancelledImage();
      }
      const failed = this.failedImage(err instanceof Error ? err.message : String(err), 'Unknown');
      failed.errorInfo = ErrorAnalyzer.AnalyzeError(err, candidate.vendorName);
      return failed;
    } finally {
      bound.Dispose();
    }
  }

  /** Whether the bound's signal was aborted by the caller rather than by its timeout. */
  private callerCancelled(bound: ExecutionBound): boolean {
    return bound.Signal?.aborted === true && !bound.TimedOut();
  }

  /**
   * A call the caller cancelled. It is classified `Cancelled`, so the failover loop returns it as it
   * is, and the run row records it as cancelled.
   */
  private cancelledImage(): ImageGenerationResult {
    const now = new Date();
    const cancelled = new ImageGenerationResult(false, now, now);
    cancelled.errorMessage = 'The Image Generator call was cancelled';
    cancelled.errorInfo = BuildCancellationErrorInfo({ provider: 'AIImageGenerationRunner' });
    return cancelled;
  }

  /** The model name the driver is given: the vendor's API name, else the model's, else its name. */
  private apiNameFor(candidate: ModelVendorCandidate): string {
    return candidate.apiName || candidate.model.APIName || candidate.model.Name;
  }

  /** A copy of the caller's params without the runner's own fields, so a driver never sees the user or keys. */
  private driverParams<T extends ImageGenerationParams | ImageEditParams>(params: T & AIImageRunOptions): T {
    const driverParams: T & Partial<AIImageRunOptions> = { ...params };
    delete driverParams.ContextUser;
    delete driverParams.ModelID;
    delete driverParams.PromptID;
    delete driverParams.APIKeys;
    delete driverParams.ParentRunID;
    delete driverParams.AgentID;
    delete driverParams.OnPromptRunCreated;
    delete driverParams.AgentRunID;
    delete driverParams.TimeoutMS;
    delete driverParams.CancellationToken;
    return driverParams;
  }

  /**
   * A failed call that allows failover to the next candidate. The severity must not be 'Fatal':
   * the failover loop stops on any Fatal error before it reads `canFailover`.
   */
  private failedImage(message: string, errorType: AIErrorType): ImageGenerationResult {
    const now = new Date();
    const failed = new ImageGenerationResult(false, now, now);
    failed.errorMessage = message;
    failed.errorInfo = { errorType, severity: 'Retriable', canFailover: true };
    return failed;
  }

  /**
   * The result returned when every failover candidate has failed, or when the caller cancelled and
   * the failover loop stopped, which the run row records as cancelled.
   */
  protected createFailoverErrorResult(lastError: Error | null, failoverAttempts: FailoverAttempt[]): ImageGenerationResult {
    if (lastError && this.IsCallerCancellation(ErrorAnalyzer.AnalyzeError(lastError))) {
      return this.cancelledImage();
    }
    const now = new Date();
    const result = new ImageGenerationResult(false, now, now);
    result.errorMessage = lastError?.message || `Failover failed after ${failoverAttempts.length} attempts`;
    result.exception = lastError;
    if (lastError) {
      result.errorInfo = ErrorAnalyzer.AnalyzeError(lastError);
    }
    return result;
  }

  /** The run row's `Messages`: the operation, the prompt text and the image count, never an image. */
  private describeRequest(params: ImageRunParams, operation: ImageOperation): string {
    return JSON.stringify({
      Operation: operation.Name,
      Prompt: params.prompt,
      NegativePrompt: params.negativePrompt,
      ImageCount: params.n ?? 1,
      AgentRunID: params.AgentRunID,
    });
  }

  /** The run row's `Result`: the count, sizes and formats of the images, never the images. */
  private describeImages(result: ImageGenerationResult): string {
    const images = result?.images ?? [];
    return JSON.stringify({
      ImageCount: images.length,
      Images: images.map(image => ({ Width: image.width ?? null, Height: image.height ?? null, Format: image.format })),
      RevisedPrompt: result?.revisedPrompt,
    });
  }

  /**
   * Finalizes the run row with the image summary, the usage to record, and any error. A call the
   * caller cancelled is recorded as `Cancelled`.
   */
  private async finalizeImageRun(
    promptRun: MJAIPromptRunEntityExtended,
    imageResult: ImageGenerationResult,
    endTime: Date,
    executionTimeMS: number
  ): Promise<void> {
    await this.FinalizeRunRecord(promptRun, imageResult.success, endTime, executionTimeMS, run => {
      run.Result = this.describeImages(imageResult);
      this.ApplyUsageToRunRecord(run, this.usageToRecord(imageResult));
      if (!imageResult.success && imageResult.errorMessage) {
        run.ErrorMessage = imageResult.errorMessage;
      }
      if (!imageResult.success && this.IsCallerCancellation(imageResult.errorInfo)) {
        run.Status = 'Cancelled';
        run.Cancelled = true;
        run.CancellationReason = 'user_requested';
      }
    });
  }

  /** Finalizes a run row as failed, so an exception after it was created never leaves it 'Running'. */
  private async finalizeFailedRun(promptRun: MJAIPromptRunEntityExtended, message: string, startTime: Date): Promise<void> {
    const endTime = new Date();
    await this.FinalizeRunRecord(promptRun, false, endTime, endTime.getTime() - startTime.getTime(), run => {
      run.ErrorMessage = message;
    });
  }

  /**
   * The usage to record: the driver's when it reported a quantity (tokens or units), otherwise the
   * images it returned, counted as output units in the `Images` measure. Image cost rows price
   * that count (`Per Image`, rate in `OutputPricePerUnit`) when the row saves. A driver's own cost
   * is kept. A call that returned no images records nothing.
   */
  private usageToRecord(result: ImageGenerationResult): ModelUsage | undefined {
    const imageCount = result.images?.length ?? 0;
    const counted = imageCount > 0 ? ModelUsage.ForMedia('Images', 0, imageCount) : undefined;
    return this.ResolveUsageToRecord(result.usage, counted);
  }

  /** Builds the caller's result from the driver's, naming the candidate that answered. */
  private buildRunResult(run: ImageRun, promptRun: MJAIPromptRunEntityExtended, executionTimeMS: number): AIImageRunResult {
    const imageResult = run.Result;
    return {
      Success: imageResult.success,
      ErrorMessage: imageResult.success ? undefined : imageResult.errorMessage,
      ImageResult: imageResult,
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
  ): AIImageRunResult {
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
    selection: ImageSelection
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
