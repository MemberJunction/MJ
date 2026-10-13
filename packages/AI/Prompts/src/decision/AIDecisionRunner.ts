import { MJGlobal, UUIDsEqual, NormalizeUUID } from '@memberjunction/global';
import { LogStatus } from '@memberjunction/core';
import { AIEngine } from '@memberjunction/aiengine';
import { TemplateEngineServer } from '@memberjunction/templates';
import {
  AIErrorType,
  BaseDecision,
  DecisionParams,
  DecisionQuestion,
  DecisionResult,
  ErrorAnalyzer,
  ModelUsage,
} from '@memberjunction/ai';
import {
  MJAIPromptEntityExtended,
  MJAIPromptRunEntityExtended,
  AIModelSelectionInfo,
  SystemPlaceholderManager,
  AIPromptParams,
  PickPromptExecutionScope,
} from '@memberjunction/ai-core-plus';
import {
  BaseModelRunner,
  ModelVendorCandidate,
  FailoverAttempt,
} from '../BaseModelRunner';
import {
  AIDecisionParams,
  AIDecisionRunResult,
} from './decision-runner.types';
import { LLMDecision } from './LLMDecision';

/**
 * The result of running a decision, the candidate that produced it (after any failover), and what
 * its attempts cost through child runs.
 */
interface DecisionRun {
  Result: DecisionResult;
  AnsweredBy: ModelVendorCandidate;
  /**
   * Whether the answering attempt made its model call through a child run linked to the decision's
   * run. Only then is its cost a descendant cost; otherwise it is the decision run's own.
   */
  AnsweredThroughChildRun: boolean;
  /**
   * What the child runs linked to the decision's run cost, summed over every attempt, the answering
   * one included. Absent when no linked child run reported a cost.
   */
  ChildRunCost?: AttemptCost;
}

/** A cost, in its currency when known. */
interface AttemptCost {
  Amount: number;
  Currency?: string;
}

/** One attempt on a candidate: the driver's result, and whether its model call ran as a linked child run. */
interface CandidateAttempt {
  Result: DecisionResult;
  LinkedChildRun: boolean;
}

/** The candidate selected for a decision, with the credential probes made while selecting it. */
interface DecisionSelection {
  Candidate: ModelVendorCandidate;
  CredentialAvailability: Map<string, boolean>;
}

/**
 * Runs typed decisions (Likelihood, Choice, Score) on `Decision`-type models. It does for a decision
 * what `AIPromptRunner` does for a chat call: selects a model from the decision prompt's bindings,
 * resolves credentials, bounds each call with the caller's cancellation and `params.timeoutMS` (when
 * set; there is no default timeout, as for chat prompts), fails over, and writes an
 * `MJ: AI Prompt Runs` row with tokens and cost.
 *
 * It owns no parsing: drivers return typed answers and `BaseDecision` validates them. The
 * configuration carrier is an `MJ: AI Prompts` row whose template renders the state when the caller
 * does not pass one.
 */
export class AIDecisionRunner extends BaseModelRunner {
  /** Decisions run only on `Decision`-type models. */
  public override get RequiredModelType(): string {
    return 'Decision';
  }

  protected override get DefaultLogCategory(): string {
    return 'AIDecisionRunner';
  }

  /**
   * Whether a driver needs its own API key. `LLMDecision` does not: it runs an MJ prompt whose chat
   * models resolve their own credentials, as `LLMReranker` does.
   */
  protected DriverRequiresCredentials(driverClass: string): boolean {
    return driverClass !== 'LLMDecision';
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
   * Makes an `LLMDecision`'s chat run a child of this decision's run, and returns whether it did. The
   * attempt's cost is booked as the decision run's descendant cost only when this returns true, so
   * linking and booking cannot disagree.
   *
   * A driver that is not an `LLMDecision` calls its model directly: there is nothing to link. The
   * child's INSERT names this run as its `ParentID`, so this run's queued INSERT must land first.
   * When that INSERT failed there is no row to point at: the child would then fail its foreign key
   * and go unrecorded too, so the chat run is left unlinked, a root run of its own.
   */
  private async linkChildRun(driver: BaseDecision, promptRun: MJAIPromptRunEntityExtended): Promise<boolean> {
    if (!(driver instanceof LLMDecision)) {
      return false;
    }
    await this.WaitForPendingPromptRunSaves();
    if (!promptRun.IsSaved) {
      return false;
    }
    driver.ParentPromptRunID = promptRun.ID;
    return true;
  }

  /**
   * Answers the questions in `params.Questions` about the state. Never throws: every failure is a
   * result with `success: false` and an `errorMessage`.
   */
  public async ExecuteDecision(params: AIDecisionParams): Promise<AIDecisionRunResult> {
    const startTime = new Date();
    let promptRun: MJAIPromptRunEntityExtended | undefined;
    let selected: ModelVendorCandidate | undefined;
    try {
      const invalid = this.validateParams(params);
      if (invalid) {
        return this.failedRunResult(invalid, startTime);
      }
      const prompt = params.prompt;
      const candidates = this.buildCandidates(prompt, params);
      if (typeof candidates === 'string') {
        return this.failedRunResult(candidates, startTime);
      }
      const selection = this.selectCandidate(prompt, candidates, params);
      if (typeof selection === 'string') {
        return this.failedRunResult(selection, startTime);
      }
      selected = selection.Candidate;
      const resolved = await this.resolveState(prompt, params);
      if ('Error' in resolved) {
        return this.failedRunResult(resolved.Error, startTime, undefined, selected);
      }
      const state = resolved.State;
      const selectionInfo = this.buildSelectionInfo(prompt, candidates, selection);
      promptRun = await this.CreateRunRecord(prompt, selected.model, params, startTime, selected.vendorId, selectionInfo, run => {
        run.Messages = JSON.stringify({ State: state, Questions: params.Questions });
      });
      const run = await this.runDecision(prompt, params, candidates, selection, state, promptRun);
      const endTime = new Date();
      const executionTimeMS = endTime.getTime() - startTime.getTime();
      await this.finalizeDecisionRun(promptRun, run, endTime, executionTimeMS);
      return this.buildRunResult(run, promptRun, selectionInfo, executionTimeMS, params);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (promptRun) {
        await this.finalizeFailedRun(promptRun, message, startTime);
      }
      return this.failedRunResult(message, startTime, promptRun, selected, params);
    }
  }

  /** Finalizes a run row as failed, so an exception after it was created never leaves it 'Running'. */
  private async finalizeFailedRun(promptRun: MJAIPromptRunEntityExtended, message: string, startTime: Date): Promise<void> {
    const endTime = new Date();
    await this.FinalizeRunRecord(promptRun, false, endTime, endTime.getTime() - startTime.getTime(), run => {
      run.ErrorMessage = message;
    });
  }

  /** Returns an error message when the request cannot run, otherwise undefined. */
  private validateParams(params: AIDecisionParams): string | undefined {
    if (!params?.prompt) {
      return 'A decision prompt is required (params.prompt)';
    }
    if (Object.keys(params.Questions ?? {}).length === 0) {
      return 'At least one question is required (params.Questions)';
    }
    return undefined;
  }

  /** Builds the candidates, or returns the reason there are none. The type floor throws here. */
  private buildCandidates(prompt: MJAIPromptEntityExtended, params: AIDecisionParams): ModelVendorCandidate[] | string {
    try {
      const candidates = this.BuildModelVendorCandidates(
        prompt,
        params.override?.modelId,
        params.configurationId,
        params.override?.vendorId,
        params.verbose
      );
      return candidates.length > 0 ? candidates : `No Decision model candidates found for prompt '${prompt.Name}'`;
    } catch (err: unknown) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  /** Candidates already warned about for lacking credentials, so each warning appears once per process. */
  private static readonly warnedMissingCredentials = new Set<string>();

  /** Selects the first candidate with credentials, or returns an error listing every candidate. */
  private selectCandidate(
    prompt: MJAIPromptEntityExtended,
    candidates: ModelVendorCandidate[],
    params: AIDecisionParams
  ): DecisionSelection | string {
    const credentialAvailability = new Map<string, boolean>();
    let selected: ModelVendorCandidate | undefined;
    for (const candidate of candidates) {
      const available = this.HasCredentialsAvailable(candidate.driverClass, prompt.ID, candidate.model.ID, candidate.vendorId, params);
      credentialAvailability.set(this.candidateKey(candidate), available);
      if (available && !selected) {
        selected = candidate;
      }
    }
    this.warnSkippedCandidates(candidates, selected, credentialAvailability);
    if (!selected) {
      const summary = candidates
        .map(c => `[Model: ${c.model.Name}, Vendor: ${c.vendorName ?? 'default'}, Driver: ${c.driverClass}]`)
        .join(', ');
      return `No Decision model has credentials available for prompt '${prompt.Name}'. Candidates: ${summary}`;
    }
    return { Candidate: selected, CredentialAvailability: credentialAvailability };
  }

  /**
   * Warns, once per process per model, when a higher-priority candidate is skipped for lack of a
   * credential. Otherwise a host without, say, Jev's key would silently send every decision to the
   * fallback model.
   */
  private warnSkippedCandidates(
    candidates: ModelVendorCandidate[],
    selected: ModelVendorCandidate | undefined,
    credentialAvailability: Map<string, boolean>
  ): void {
    for (const candidate of candidates) {
      if (candidate === selected) {
        return;
      }
      const key = this.candidateKey(candidate);
      if (credentialAvailability.get(key) === false && !AIDecisionRunner.warnedMissingCredentials.has(key)) {
        AIDecisionRunner.warnedMissingCredentials.add(key);
        LogStatus(`AIDecisionRunner: skipping '${candidate.model.Name}' (${candidate.driverClass}): no credential. ` +
          `Set AI_VENDOR_API_KEY__${candidate.driverClass.toUpperCase()} or bind a credential to use it.`);
      }
    }
  }

  /** The caller's explicit state, or the prompt's template rendered with the caller's data. */
  private async resolveState(
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams
  ): Promise<{ State: string | Record<string, unknown> } | { Error: string }> {
    if (params.State !== undefined && params.State !== null) {
      return { State: params.State };
    }
    const rendered = await this.renderStateFromTemplate(prompt, params);
    return rendered.success && rendered.state !== undefined
      ? { State: rendered.state }
      : { Error: rendered.errorMessage ?? 'Failed to render the state from the prompt template' };
  }

  /**
   * Runs the selected candidate alone when failover is off, otherwise the base failover loop. Tracks
   * the candidate that produced the result, so the caller reports the model that actually answered,
   * and adds up what every attempt's linked child run cost, so none of those costs is lost when a
   * later attempt answers.
   */
  private async runDecision(
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams,
    candidates: ModelVendorCandidate[],
    selection: DecisionSelection,
    state: string | Record<string, unknown>,
    promptRun: MJAIPromptRunEntityExtended
  ): Promise<DecisionRun> {
    let answeredBy = selection.Candidate;
    let answeredThroughChildRun = false;
    let childRunCost: AttemptCost | undefined;
    const attempt = async (candidate: ModelVendorCandidate): Promise<DecisionResult> => {
      answeredBy = candidate;
      answeredThroughChildRun = false;
      const outcome = await this.executeOnCandidate(candidate, state, params, prompt, promptRun);
      answeredThroughChildRun = outcome.LinkedChildRun;
      if (outcome.LinkedChildRun) {
        childRunCost = this.addCost(childRunCost, outcome.Result.Usage);
      }
      return outcome.Result;
    };
    const failoverConfig = this.getFailoverConfiguration(prompt);
    const result = failoverConfig.strategy === 'None'
      ? await attempt(selection.Candidate)
      : await this.ExecuteWithFailover<DecisionResult>(
          prompt,
          params,
          candidates,
          failoverConfig,
          attempt,
          (err, attempts) => this.createFailoverErrorResult(err, attempts),
          promptRun,
          selection.CredentialAvailability
        );
    return { Result: result, AnsweredBy: answeredBy, AnsweredThroughChildRun: answeredThroughChildRun, ChildRunCost: childRunCost };
  }

  /** Adds an attempt's cost to a running total. An attempt that reported no cost adds nothing. */
  private addCost(total: AttemptCost | undefined, usage: ModelUsage | undefined): AttemptCost | undefined {
    if (usage?.cost === undefined) {
      return total;
    }
    return { Amount: (total?.Amount ?? 0) + usage.cost, Currency: total?.Currency ?? usage.costCurrency };
  }

  /**
   * Makes the decision on one candidate: builds its driver, links the driver's child run when it
   * makes one, and calls it.
   */
  private async executeOnCandidate(
    candidate: ModelVendorCandidate,
    state: string | Record<string, unknown>,
    params: AIDecisionParams,
    prompt: MJAIPromptEntityExtended,
    promptRun: MJAIPromptRunEntityExtended
  ): Promise<CandidateAttempt> {
    const driver = await this.driverForCandidate(candidate, params, prompt);
    if (driver instanceof DecisionResult) {
      return { Result: driver, LinkedChildRun: false };
    }
    const linkedChildRun = await this.linkChildRun(driver, promptRun);
    return { Result: await this.callDriver(driver, candidate, state, params, prompt), LinkedChildRun: linkedChildRun };
  }

  /**
   * The candidate's driver, after checking its limits and resolving its credential, or a failed
   * result that allows failover and says why there is none.
   */
  private async driverForCandidate(
    candidate: ModelVendorCandidate,
    params: AIDecisionParams,
    prompt: MJAIPromptEntityExtended
  ): Promise<BaseDecision | DecisionResult> {
    const limitError = this.checkModelLimits(candidate, params.Questions);
    if (limitError) {
      return this.failedDecision(limitError, 'InvalidRequest');
    }
    let apiKey = '';
    if (this.DriverRequiresCredentials(candidate.driverClass)) {
      try {
        apiKey = await this.ResolveCredentialForExecution(candidate.driverClass, prompt.ID, candidate.model.ID, candidate.vendorId, params);
      } catch (err: unknown) {
        return this.failedDecision(err instanceof Error ? err.message : String(err), 'Authentication');
      }
    }
    const driver = this.createDriver(candidate, apiKey, params);
    return typeof driver === 'string' ? this.failedDecision(driver, 'ModelError') : driver;
  }

  /**
   * Checks the request against the model's declared `Decision` limits. A breach is an error that
   * allows failover, because another model may accept the request. `MaxStateTokens` is not checked
   * yet: the runner has no token counter.
   */
  private checkModelLimits(candidate: ModelVendorCandidate, questions: Record<string, DecisionQuestion>): string | undefined {
    const modelVendorRow = candidate.vendorId
      ? (candidate.model.ModelVendors ?? []).find(mv => UUIDsEqual(mv.VendorID, candidate.vendorId))
      : undefined;
    const limits = AIEngine.Instance.GetEffectiveModelConfiguration(candidate.model.ID, modelVendorRow?.ID)?.Decision;
    if (!limits) {
      return undefined;
    }
    const exceeds = (limit: number | null | undefined, count: number): boolean =>
      typeof limit === 'number' && limit > 0 && count > limit;
    const model = candidate.model.Name;
    const questionCount = Object.keys(questions).length;
    if (exceeds(limits.MaxQuestionsPerCall, questionCount)) {
      return `${questionCount} questions exceed the limit of ${limits.MaxQuestionsPerCall} per call for '${model}'`;
    }
    for (const [key, q] of Object.entries(questions)) {
      if (q.Kind === 'Choice' && exceeds(limits.MaxChoiceOptions, q.Options.length)) {
        return `Choice '${key}' has ${q.Options.length} options, over the limit of ${limits.MaxChoiceOptions} for '${model}'`;
      }
      if (q.Kind === 'Score' && exceeds(limits.MaxScoreLevels, q.Levels.length)) {
        return `Score '${key}' has ${q.Levels.length} levels, over the limit of ${limits.MaxScoreLevels} for '${model}'`;
      }
    }
    return undefined;
  }

  /**
   * Builds the candidate's driver through the ClassFactory. `LLMDecision` takes the ID of the chat
   * prompt named by the model-vendor row's `APIName`; every other driver takes only its API key.
   * Returns an error message when the driver cannot be built.
   */
  private createDriver(candidate: ModelVendorCandidate, apiKey: string, params: AIDecisionParams): BaseDecision | string {
    let driver: BaseDecision | null;
    if (candidate.driverClass === 'LLMDecision') {
      const target = candidate.apiName?.trim().toLowerCase();
      const chatPrompt = target ? AIEngine.Instance.Prompts.find(p => p.Name?.trim().toLowerCase() === target) : undefined;
      if (!chatPrompt) {
        return `LLMDecision's chat prompt '${candidate.apiName ?? ''}' was not found`;
      }
      driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, candidate.driverClass, apiKey, chatPrompt.ID, params.contextUser);
      // LLMDecision answers by running a chat prompt of its own, which must spend the decision's
      // credentials, not resolve its own from the platform.
      if (driver instanceof LLMDecision) {
        driver.ExecutionScope = PickPromptExecutionScope(params);
      }
    } else {
      driver = MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, candidate.driverClass, apiKey);
    }
    if (!driver || driver.constructor === BaseDecision) {
      return `No decision driver is registered for driver class '${candidate.driverClass}'`;
    }
    return driver;
  }

  /** Calls the driver, bounded by the caller's cancellation and `params.timeoutMS` when set. */
  private async callDriver(
    driver: BaseDecision,
    candidate: ModelVendorCandidate,
    state: string | Record<string, unknown>,
    params: AIDecisionParams,
    prompt: MJAIPromptEntityExtended
  ): Promise<DecisionResult> {
    const bound = this.createExecutionBound(prompt, params, params.cancellationToken);
    try {
      const driverParams: DecisionParams = {
        Model: candidate.apiName ?? candidate.model.APIName,
        State: state,
        Questions: params.Questions,
        CancellationToken: bound.Signal,
      };
      return await driver.Decide(driverParams);
    } catch (err: unknown) {
      const failed = this.failedDecision(err instanceof Error ? err.message : String(err), 'Unknown');
      failed.errorInfo = ErrorAnalyzer.AnalyzeError(err, candidate.vendorName);
      return failed;
    } finally {
      bound.Dispose();
    }
  }

  /**
   * A failed decision that allows failover to the next candidate. The severity must not be 'Fatal':
   * the failover loop stops on any Fatal error before it reads `canFailover`.
   */
  private failedDecision(message: string, errorType: AIErrorType): DecisionResult {
    const now = new Date();
    const failed = new DecisionResult(false, now, now);
    failed.errorMessage = message;
    failed.errorInfo = { errorType, severity: 'Retriable', canFailover: true };
    return failed;
  }

  /** The result returned when every failover candidate has failed. */
  protected createFailoverErrorResult(lastError: Error | null, failoverAttempts: FailoverAttempt[]): DecisionResult {
    const now = new Date();
    const result = new DecisionResult(false, now, now);
    result.errorMessage = lastError?.message || `Failover failed after ${failoverAttempts.length} attempts`;
    result.exception = lastError;
    if (lastError) {
      result.errorInfo = ErrorAnalyzer.AnalyzeError(lastError);
    }
    result.Answers = {};
    return result;
  }

  /**
   * Finalizes the run row: every answer with its full distribution in `Result`, the resolved model
   * version in `ModelSpecificResponseDetails`, and tokens and cost from the driver's usage.
   */
  private async finalizeDecisionRun(
    promptRun: MJAIPromptRunEntityExtended,
    decisionRun: DecisionRun,
    endTime: Date,
    executionTimeMS: number
  ): Promise<void> {
    const decisionResult = decisionRun.Result;
    await this.FinalizeRunRecord(promptRun, decisionResult.success, endTime, executionTimeMS, run => {
      run.Result = JSON.stringify(decisionResult.Answers ?? {});
      if (decisionResult.ResolvedModel) {
        run.ModelSpecificResponseDetails = JSON.stringify({ ResolvedModel: decisionResult.ResolvedModel });
      }
      this.applyUsage(run, decisionRun);
      if (!decisionResult.success && decisionResult.errorMessage) {
        run.ErrorMessage = decisionResult.errorMessage;
      }
    });
  }

  /**
   * Records the answering attempt's tokens on the run, and the cost by where it was incurred:
   * - a model call the answering driver made directly is this run's own `Cost`;
   * - a model call made through a child run linked to this run (`LLMDecision`'s chat prompt) is that
   *   child's cost, so it is recorded as `DescendantCost` and in `TotalCost`, never as `Cost`: a
   *   report summing `Cost` over every run would otherwise count the chat call twice.
   *
   * `DescendantCost` sums every attempt's linked child run, not only the answering one's: each is a
   * child of this run, and the server's rollup sums them all, so recording less would overwrite
   * that rollup with a smaller number. An attempt whose chat run could not be linked is not a
   * descendant, so when it answers, its cost is this run's own.
   */
  private applyUsage(run: MJAIPromptRunEntityExtended, decisionRun: DecisionRun): void {
    const usage = decisionRun.Result.Usage;
    if (usage) {
      run.TokensPrompt = usage.promptTokens;
      run.TokensCompletion = usage.completionTokens;
      run.TokensUsed = usage.totalTokens;
      if (usage.cost !== undefined && !decisionRun.AnsweredThroughChildRun) {
        run.Cost = usage.cost;
      }
    }
    const childRunCost = decisionRun.ChildRunCost;
    if (childRunCost) {
      run.DescendantCost = childRunCost.Amount;
      run.TotalCost = (run.Cost ?? 0) + childRunCost.Amount;
    }
    const currency = usage?.costCurrency ?? childRunCost?.Currency;
    if (currency !== undefined) {
      run.CostCurrency = currency;
    }
  }

  /** Builds the caller's result from the driver's, naming the candidate that answered. */
  private buildRunResult(
    run: DecisionRun,
    promptRun: MJAIPromptRunEntityExtended,
    selectionInfo: AIModelSelectionInfo,
    executionTimeMS: number,
    params: AIDecisionParams
  ): AIDecisionRunResult {
    const decisionResult = run.Result;
    return {
      success: decisionResult.success,
      status: decisionResult.success ? 'Completed' : 'Failed',
      cancelled: params.cancellationToken?.aborted === true,
      errorMessage: decisionResult.errorMessage,
      promptRun,
      executionTimeMS,
      promptTokens: decisionResult.Usage?.promptTokens,
      completionTokens: decisionResult.Usage?.completionTokens,
      tokensUsed: decisionResult.Usage?.totalTokens,
      cost: decisionResult.Usage?.cost,
      costCurrency: decisionResult.Usage?.costCurrency,
      modelInfo: this.modelInfoFor(run.AnsweredBy),
      modelSelectionInfo: selectionInfo,
      Answers: decisionResult.success ? decisionResult.Answers ?? {} : {},
      DecisionResult: decisionResult,
      DriverClass: run.AnsweredBy.driverClass,
    };
  }

  /** A failed result for a request that never reached, or never finished, a model call. */
  private failedRunResult(
    errorMessage: string,
    startTime: Date,
    promptRun?: MJAIPromptRunEntityExtended,
    selected?: ModelVendorCandidate,
    params?: AIDecisionParams
  ): AIDecisionRunResult {
    return {
      success: false,
      status: 'Failed',
      cancelled: params?.cancellationToken?.aborted === true,
      errorMessage,
      promptRun,
      executionTimeMS: new Date().getTime() - startTime.getTime(),
      modelInfo: selected ? this.modelInfoFor(selected) : undefined,
      Answers: {},
      DriverClass: selected?.driverClass,
    };
  }

  private modelInfoFor(candidate: ModelVendorCandidate): AIDecisionRunResult['modelInfo'] {
    return {
      modelId: candidate.model.ID,
      modelName: candidate.model.Name,
      vendorId: candidate.vendorId,
      vendorName: candidate.vendorName,
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
    selection: DecisionSelection
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

  /**
   * Renders the prompt's template into the state, with the same data layering as the chat runner:
   * system placeholders, then `params.data`, then `params.templateData`.
   */
  private async renderStateFromTemplate(
    prompt: MJAIPromptEntityExtended,
    params: AIDecisionParams
  ): Promise<{ success: boolean; state?: string; errorMessage?: string }> {
    try {
      if (!prompt.TemplateID) {
        return { success: false, errorMessage: `Prompt '${prompt.Name}' has no template, and no State was provided` };
      }
      await TemplateEngineServer.Instance.Config(false, params.contextUser);
      const template = TemplateEngineServer.Instance.Templates?.find(t => UUIDsEqual(t.ID, prompt.TemplateID));
      if (!template) {
        return { success: false, errorMessage: `Template ${prompt.TemplateID} for prompt '${prompt.Name}' was not found` };
      }
      const content = template.GetHighestPriorityContent();
      if (!content) {
        return { success: false, errorMessage: `Template '${template.Name}' for prompt '${prompt.Name}' has no content` };
      }
      const systemPlaceholders = await SystemPlaceholderManager.resolveAllPlaceholders(params);
      const mergedData = { ...systemPlaceholders, ...params.data, ...params.templateData };
      const rendered = await TemplateEngineServer.Instance.RenderTemplate(template, content, mergedData, true, false);
      if (!rendered?.Success) {
        return { success: false, errorMessage: `Failed to render the template for prompt '${prompt.Name}': ${rendered?.Message ?? 'unknown error'}` };
      }
      return { success: true, state: rendered.Output };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, errorMessage: `Error rendering the template for prompt '${prompt.Name}': ${message}` };
    }
  }
}
