/**
 * @fileoverview The shared lifecycle of the media runners: text-to-speech, speech-to-text and video.
 *
 * @module @memberjunction/ai-prompts
 */

import { MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { AIEngine } from '@memberjunction/aiengine';
import { AIErrorType, BaseModel, BaseResult, ErrorAnalyzer } from '@memberjunction/ai';
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
  FailoverConfiguration,
  ModelVendorCandidate,
} from '../BaseModelRunner';
import { AIPromptTimeoutError } from '../AIPromptTimeoutError';
import {
  AIMediaRunOptions,
  AIMediaRunOutcome,
  MediaDriverOutput,
  MediaOperation,
} from './media-runner.types';

/**
 * One driver call as the failover loop carries it. `ExecuteWithFailover` needs a `BaseResult`, and
 * the media drivers' results (`SpeechResult`, `VideoResult`) are not one, so the driver's result
 * rides along as `Output`.
 */
class MediaCallResult<TOutput> extends BaseResult {
  /** The driver's result, when the driver returned one. */
  public Output?: TOutput;

  /** Whether the caller cancelled the call, which the run row records as cancelled rather than failed. */
  public Cancelled = false;

  constructor(success: boolean, output?: TOutput) {
    const now = new Date();
    super(success, now, now);
    this.Output = output;
  }
}

/** The call's result, and the candidate that produced it (after any failover). */
interface MediaCall<TOutput> {
  Result: MediaCallResult<TOutput>;
  AnsweredBy: ModelVendorCandidate;
}

/** The candidate selected for a call, with the credential probes made while selecting it. */
interface MediaSelection {
  Candidate: ModelVendorCandidate;
  CredentialAvailability: Map<string, boolean>;
}

/** Everything chosen before the run row exists: the prompt, its params, and the candidates. */
interface MediaRunPlan {
  Prompt: MJAIPromptEntityExtended;
  PromptParams: AIPromptParams;
  Candidates: ModelVendorCandidate[];
  Selection: MediaSelection;
}

/**
 * Runs one media operation the way `AIImageGenerationRunner` runs an image call: selects a model
 * from the carrier prompt's bindings (or the pinned `ModelID`), resolves its credential, calls the
 * driver with failover, and records the call as an `MJ: AI Prompt Runs` row. The row never holds
 * media bytes.
 *
 * A subclass names its model type ({@link RequiredModelType}), its default carrier prompt and its
 * driver base class, and describes each operation as a {@link MediaOperation}.
 *
 * Failover follows the carrier prompt's `FailoverStrategy`: `None` makes one attempt,
 * `SameModelDifferentVendor` stays on the selected model's vendors, and `NextBestModel` or
 * `PowerRank` may reach any candidate. Whether a failure fails over is `ErrorAnalyzer`'s call, as it
 * is for chat prompts, made on the error the provider returned: the driver's `errorInfo`, or the
 * error a driver threw. The shipped drivers report `errorInfo`, which keeps the HTTP status, so a rate
 * limit, an outage or a timeout fails over, and a request the vendor rejected as invalid (a 400 or 422
 * the analyzer does not read as vendor-specific validation) does not. A driver that reports only a
 * message is classified from the message, which recognizes rate limits, outages and a few malformed
 * requests; any other message reads as `Unknown`, which fails over.
 *
 * Each driver call is bounded by the caller's `TimeoutMS` and `CancellationToken`, as a chat call is
 * by `timeoutMS` and `cancellationToken`.
 *
 * @typeParam TParams The operation params, including {@link AIMediaRunOptions}.
 * @typeParam TDriver The driver base class, resolved through the ClassFactory by driver class.
 * @typeParam TOutput The driver's result type.
 */
export abstract class BaseMediaRunner<
  TParams extends AIMediaRunOptions,
  TDriver extends BaseModel,
  TOutput extends MediaDriverOutput,
> extends BaseModelRunner {
  /** The name of the `MJ: AI Prompts` row used when the caller names none. */
  protected abstract get DefaultPromptName(): string;

  /** The base class the drivers register against. The ClassFactory resolves it by driver class. */
  protected abstract get DriverBaseClass(): abstract new (apiKey: string) => TDriver;

  /**
   * The shared lifecycle: validate, choose the carrier prompt and candidates, create the run row,
   * call the driver with failover, then finalize the row. An exception after the row exists
   * finalizes it as failed, so it never stays 'Running'. Never throws.
   */
  protected async RunMediaOperation(
    params: TParams,
    operation: MediaOperation<TParams, TDriver, TOutput>
  ): Promise<AIMediaRunOutcome<TOutput>> {
    const startTime = new Date();
    let promptRun: MJAIPromptRunEntityExtended | undefined;
    let selected: ModelVendorCandidate | undefined;
    try {
      const refusal = this.refusalFor(params, operation);
      if (refusal) {
        return this.failedOutcome(refusal, startTime);
      }
      await AIEngine.Instance.Config(false, params.ContextUser);
      const plan = this.planRun(params);
      if (typeof plan === 'string') {
        return this.failedOutcome(plan, startTime);
      }
      selected = plan.Selection.Candidate;
      promptRun = await this.CreateRunRecord(plan.Prompt, selected.model, plan.PromptParams, startTime, selected.vendorId,
        this.buildSelectionInfo(plan), run => {
          run.Messages = operation.DescribeRequest(params);
        });
      const call = await this.runOnCandidates(plan, operation, promptRun);
      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();
      await this.finalizeMediaRun(promptRun, call.Result, params, operation, endTime, executionTimeMS);
      return this.buildOutcome(call, promptRun, executionTimeMS);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (promptRun) {
        await this.finalizeFailedRun(promptRun, message, startTime);
      }
      return this.failedOutcome(message, startTime, promptRun, selected);
    }
  }

  /**
   * A copy of the caller's params without the runner's own fields, so a driver never sees the user
   * or the keys.
   */
  protected DriverParams<T>(params: T & AIMediaRunOptions): T {
    const driverParams: T & Partial<AIMediaRunOptions> = { ...params };
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

  /** Why the call cannot start: no params, params the operation refuses, or a caller that already cancelled. */
  private refusalFor(params: TParams, operation: MediaOperation<TParams, TDriver, TOutput>): string | undefined {
    if (!params) {
      return `${this.RequiredModelType} run parameters are required`;
    }
    const invalid = operation.Validate(params);
    if (invalid) {
      return invalid;
    }
    return params.CancellationToken?.aborted ? `The ${this.RequiredModelType} call was cancelled before it started` : undefined;
  }

  /** Chooses the prompt and the candidates, or returns why the call cannot run. */
  private planRun(params: TParams): MediaRunPlan | string {
    const prompt = this.resolvePrompt(params.PromptID);
    if (typeof prompt === 'string') {
      return prompt;
    }
    const promptParams = this.buildPromptParams(params, prompt);
    const candidates = this.buildCandidates(prompt, params.ModelID, promptParams);
    if (typeof candidates === 'string') {
      return candidates;
    }
    const selection = this.selectCandidate(prompt, candidates, promptParams);
    if (typeof selection === 'string') {
      return selection;
    }
    return { Prompt: prompt, PromptParams: promptParams, Candidates: candidates, Selection: selection };
  }

  /** The carrier prompt named by `PromptID`, or the default one by name; otherwise why it is missing. */
  private resolvePrompt(promptId: string | undefined): MJAIPromptEntityExtended | string {
    if (promptId) {
      const byId = AIEngine.Instance.Prompts.find(p => UUIDsEqual(p.ID, promptId));
      return byId ?? `${this.RequiredModelType} prompt ${promptId} was not found`;
    }
    const target = this.DefaultPromptName.toLowerCase();
    const byName = AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target);
    return byName ?? `The '${this.DefaultPromptName}' prompt was not found. Push the prompt metadata, or pass PromptID.`;
  }

  /**
   * The base runner reads its settings from `AIPromptParams`, so the media params are mapped onto
   * one: the carrier prompt, the context user, the keys, the parent run, the agent and its
   * run-created hook, the timeout and cancellation token, and the runner's provider.
   */
  private buildPromptParams(params: TParams, prompt: MJAIPromptEntityExtended): AIPromptParams {
    const promptParams = new AIPromptParams();
    promptParams.prompt = prompt;
    promptParams.contextUser = params.ContextUser;
    promptParams.apiKeys = params.APIKeys;
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
      return candidates.length > 0 ? candidates : `No ${this.RequiredModelType} model candidates found for prompt '${prompt.Name}'`;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /** Selects the first candidate with credentials, or returns an error listing every candidate. */
  private selectCandidate(
    prompt: MJAIPromptEntityExtended,
    candidates: ModelVendorCandidate[],
    promptParams: AIPromptParams
  ): MediaSelection | string {
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
      return `No ${this.RequiredModelType} model has credentials available for prompt '${prompt.Name}'. Candidates: ${summary}`;
    }
    return { Candidate: selected, CredentialAvailability: credentialAvailability };
  }

  /**
   * Runs the selected candidate alone when failover is off, otherwise the base failover loop over the
   * candidates the strategy allows. Tracks the candidate that produced the result, so the caller
   * reports the model that actually answered.
   */
  private async runOnCandidates(
    plan: MediaRunPlan,
    operation: MediaOperation<TParams, TDriver, TOutput>,
    promptRun: MJAIPromptRunEntityExtended
  ): Promise<MediaCall<TOutput>> {
    let answeredBy = plan.Selection.Candidate;
    const attempt = (candidate: ModelVendorCandidate): Promise<MediaCallResult<TOutput>> => {
      answeredBy = candidate;
      return this.executeOnCandidate(candidate, plan, operation);
    };
    const failoverConfig = this.getFailoverConfiguration(plan.Prompt);
    const result = failoverConfig.strategy === 'None'
      ? await attempt(plan.Selection.Candidate)
      : await this.ExecuteWithFailover<MediaCallResult<TOutput>>(
          plan.Prompt,
          plan.PromptParams,
          this.failoverCandidates(failoverConfig.strategy, plan.Candidates, plan.Selection.Candidate),
          failoverConfig,
          attempt,
          (err, attempts) => this.createFailoverErrorResult(err, attempts),
          promptRun,
          plan.Selection.CredentialAvailability
        );
    return { Result: result, AnsweredBy: answeredBy };
  }

  /**
   * The candidates a call may fail over to. `ExecuteWithFailover` walks the list it is given without
   * applying the strategy, so `SameModelDifferentVendor` is narrowed here to the selected model's
   * vendors. A voice, an avatar or an asset ID belongs to one model's vendor, which is why the media
   * prompts that carry one use that strategy.
   */
  private failoverCandidates(
    strategy: FailoverConfiguration['strategy'],
    candidates: ModelVendorCandidate[],
    selected: ModelVendorCandidate
  ): ModelVendorCandidate[] {
    return strategy === 'SameModelDifferentVendor'
      ? candidates.filter(c => UUIDsEqual(c.model.ID, selected.model.ID))
      : candidates;
  }

  /**
   * Makes the call on one candidate: resolves its credential, builds its driver, and calls it. A
   * caller that cancelled while an earlier candidate ran gets no further calls.
   */
  private async executeOnCandidate(
    candidate: ModelVendorCandidate,
    plan: MediaRunPlan,
    operation: MediaOperation<TParams, TDriver, TOutput>
  ): Promise<MediaCallResult<TOutput>> {
    if (plan.PromptParams.cancellationToken?.aborted) {
      return this.cancelledCall();
    }
    let apiKey: string;
    try {
      apiKey = await this.ResolveCredentialForExecution(candidate.driverClass, plan.Prompt.ID, candidate.model.ID, candidate.vendorId, plan.PromptParams);
    } catch (err: unknown) {
      return this.failedCall(err instanceof Error ? err.message : String(err), 'Authentication');
    }
    const driver = this.createDriver(candidate, apiKey);
    if (typeof driver === 'string') {
      return this.failedCall(driver, 'ModelError');
    }
    return this.callDriver(driver, candidate, plan, operation);
  }

  /** Builds the candidate's driver through the ClassFactory, or returns why it cannot be built. */
  private createDriver(candidate: ModelVendorCandidate, apiKey: string): TDriver | string {
    const resolved = MJGlobal.Instance.ClassFactory.TryCreateInstance<TDriver>(this.DriverBaseClass, candidate.driverClass, apiKey);
    if (!resolved.Resolved || !resolved.Instance) {
      return `No ${this.DriverBaseClass.name} driver is registered for driver class '${candidate.driverClass}'`;
    }
    return resolved.Instance;
  }

  /**
   * Calls the driver within the call's bound: the caller's timeout and cancellation token, composed
   * as for a chat call. A driver that throws, or that the timeout abandons, gets the vendor's
   * classification of the error; a timeout reads as a network error, so it fails over. A cancelled
   * call is never failed over.
   */
  private async callDriver(
    driver: TDriver,
    candidate: ModelVendorCandidate,
    plan: MediaRunPlan,
    operation: MediaOperation<TParams, TDriver, TOutput>
  ): Promise<MediaCallResult<TOutput>> {
    const bound = this.createExecutionBound(plan.Prompt, plan.PromptParams, plan.PromptParams.cancellationToken);
    try {
      const output = await this.withinBound(operation.Invoke(driver, this.apiNameFor(candidate)), bound, plan.Prompt);
      if (!output) {
        return this.failedCall(`The driver '${candidate.driverClass}' returned no result`, 'ModelError');
      }
      return this.callResultFrom(output, candidate);
    } catch (err: unknown) {
      if (bound.Signal?.aborted && !bound.TimedOut()) {
        return this.cancelledCall();
      }
      const failed = this.failedCall(err instanceof Error ? err.message : String(err), 'Unknown');
      failed.errorInfo = ErrorAnalyzer.AnalyzeError(err, candidate.vendorName);
      return failed;
    } finally {
      bound.Dispose();
    }
  }

  /**
   * Waits for the driver call, or rejects when the bound aborts first. The media drivers take no
   * abort signal, so an abandoned request is not torn down: the runner stops waiting for it and
   * ignores its result.
   */
  private async withinBound(call: Promise<TOutput>, bound: ExecutionBound, prompt: MJAIPromptEntityExtended): Promise<TOutput> {
    const signal = bound.Signal;
    if (!signal) {
      return call;
    }
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(bound.TimedOut()
        ? this.timeoutError(signal, prompt, bound)
        : new Error(`The ${this.RequiredModelType} call was cancelled`));
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    try {
      return await Promise.race([call, aborted]);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  }

  /** The error a timed-out call fails with: the bound's own `AIPromptTimeoutError`. */
  private timeoutError(signal: AbortSignal, prompt: MJAIPromptEntityExtended, bound: ExecutionBound): Error {
    return signal.reason instanceof AIPromptTimeoutError ? signal.reason : new AIPromptTimeoutError(prompt.Name, bound.TimeoutMS ?? 0);
  }

  /**
   * Wraps the driver's result for the failover loop. A failure keeps the driver's classification,
   * which the shipped drivers take from the error the provider's SDK threw, with its HTTP status. A
   * driver that reports only a message gets the analyzer's reading of the message.
   */
  private callResultFrom(output: TOutput, candidate: ModelVendorCandidate): MediaCallResult<TOutput> {
    const call = new MediaCallResult<TOutput>(output.success, output);
    if (!output.success) {
      call.errorMessage = output.errorMessage || `The driver '${candidate.driverClass}' reported a failure with no message`;
      call.errorInfo = output.errorInfo ?? ErrorAnalyzer.AnalyzeError(new Error(call.errorMessage), candidate.vendorName);
    }
    return call;
  }

  /**
   * The model name the driver is given: the vendor's API name, else the model's. A model with
   * neither leaves the driver to use its default, rather than sending MemberJunction's display name
   * as a vendor model ID.
   */
  private apiNameFor(candidate: ModelVendorCandidate): string | undefined {
    return candidate.apiName || candidate.model.APIName || undefined;
  }

  /**
   * A failed call that allows failover to the next candidate. The severity must not be 'Fatal':
   * the failover loop stops on any Fatal error before it reads `canFailover`.
   */
  private failedCall(message: string, errorType: AIErrorType): MediaCallResult<TOutput> {
    const failed = new MediaCallResult<TOutput>(false);
    failed.errorMessage = message;
    failed.errorInfo = { errorType, severity: 'Retriable', canFailover: true };
    return failed;
  }

  /**
   * A call the caller cancelled. It is not eligible for failover, so the failover loop returns it
   * as it is, and the run row records it as cancelled.
   */
  private cancelledCall(): MediaCallResult<TOutput> {
    const cancelled = new MediaCallResult<TOutput>(false);
    cancelled.errorMessage = `The ${this.RequiredModelType} call was cancelled`;
    cancelled.errorInfo = { errorType: 'Unknown', severity: 'Fatal', canFailover: false };
    cancelled.Cancelled = true;
    return cancelled;
  }

  /** The result returned when every failover candidate has failed. */
  private createFailoverErrorResult(lastError: Error | null, failoverAttempts: FailoverAttempt[]): MediaCallResult<TOutput> {
    const result = new MediaCallResult<TOutput>(false);
    result.errorMessage = lastError?.message || `Failover failed after ${failoverAttempts.length} attempts`;
    result.exception = lastError;
    if (lastError) {
      result.errorInfo = ErrorAnalyzer.AnalyzeError(lastError);
    }
    return result;
  }

  /**
   * Finalizes the run row: the operation's description of a successful result, the usage to record,
   * and any error, or the cancellation. The runner's own count applies only to a successful call, so
   * a failed call is never billed for what it was sent.
   */
  private async finalizeMediaRun(
    promptRun: MJAIPromptRunEntityExtended,
    call: MediaCallResult<TOutput>,
    params: TParams,
    operation: MediaOperation<TParams, TDriver, TOutput>,
    endTime: Date,
    executionTimeMS: number
  ): Promise<void> {
    const output = call.Output;
    const counted = call.success && output ? operation.CountUsage?.(params, output) : undefined;
    await this.FinalizeRunRecord(promptRun, call.success, endTime, executionTimeMS, run => {
      if (call.success && output) {
        run.Result = operation.DescribeOutput(output);
      }
      this.ApplyUsageToRunRecord(run, this.ResolveUsageToRecord(output?.usage, counted));
      if (!call.success && call.errorMessage) {
        run.ErrorMessage = call.errorMessage;
      }
      if (call.Cancelled) {
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

  /** Builds the outcome from the call, naming the candidate that answered. */
  private buildOutcome(call: MediaCall<TOutput>, promptRun: MJAIPromptRunEntityExtended, executionTimeMS: number): AIMediaRunOutcome<TOutput> {
    const result = call.Result;
    return {
      Success: result.success,
      ErrorMessage: result.success ? undefined : result.errorMessage,
      Output: result.Output,
      PromptRunID: promptRun.ID,
      ModelID: call.AnsweredBy.model.ID,
      ModelName: call.AnsweredBy.model.Name,
      DriverClass: call.AnsweredBy.driverClass,
      ExecutionTimeMS: executionTimeMS,
    };
  }

  /** A failed outcome for a request that never reached, or never finished, a model call. */
  private failedOutcome(
    errorMessage: string,
    startTime: Date,
    promptRun?: MJAIPromptRunEntityExtended,
    selected?: ModelVendorCandidate
  ): AIMediaRunOutcome<TOutput> {
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
  private buildSelectionInfo(plan: MediaRunPlan): AIModelSelectionInfo {
    const info = new AIModelSelectionInfo();
    const selected = plan.Selection.Candidate;
    info.ModelSelected = selected.model;
    info.vendorSelected = selected.vendorId ? AIEngine.Instance.VendorsByID.get(NormalizeUUID(selected.vendorId)) : undefined;
    info.selectionStrategy = plan.Prompt.SelectionStrategy || 'Specific';
    info.SelectionReason = 'First candidate with available credentials';
    info.FallbackUsed = false;
    info.ModelsConsidered = plan.Candidates.map(c => {
      const available = plan.Selection.CredentialAvailability.get(this.candidateKey(c)) ?? false;
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
