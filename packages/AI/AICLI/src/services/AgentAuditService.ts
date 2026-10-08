import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import {
  MJAIAgentRunEntity,
  MJAIAgentRunStepEntity
} from '@memberjunction/core-entities';
import { InitializeMJProvider } from '../lib/mj-provider';
import { AuditAnalyzer } from '../lib/audit-analyzer';
import { AuditFormatter, AuditOutputFormat } from '../lib/audit-formatter';
import {
  SummarizeWorkflowTasks,
  WORKFLOW_TASK_FIELDS,
  WorkflowTaskInfo,
  WorkflowTaskRow,
  WorkflowTaskSummary,
} from '../lib/workflow-tasks';

export interface ListRunsOptions {
  agentName?: string;
  status: 'success' | 'failed' | 'running' | 'all';
  days: number;
  limit: number;
}

export interface StepDetailOptions {
  detailLevel: 'minimal' | 'standard' | 'detailed' | 'full';
  maxTokens: number;
}

export interface RunSummaryOptions {
  includeStepList: boolean;
  maxTokens: number;
}

export interface RunSummary {
  // Run metadata
  runId: string;
  agentName: string;
  agentId: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  duration: number; // milliseconds

  // Performance metrics
  /**
   * Every token the run's models processed: all input (uncached, cache reads and cache writes) plus
   * output. The run row's `TotalTokensUsed` is narrower — uncached input plus output — because
   * prompt runs store cache reads and writes in their own columns; see {@link Tokens}.
   */
  totalTokens: number;
  /**
   * The run's recorded `TotalCost` when it has one — priced per token bucket, cache reads and writes
   * included — otherwise a flat per-token estimate. {@link CostSource} says which.
   */
  estimatedCost: number;
  /** Whether {@link estimatedCost} is the run's recorded cost or a flat estimate. */
  CostSource?: 'Recorded' | 'Estimated';
  /** Input and output tokens, with input broken into the buckets the provider reported. */
  Tokens?: RunTokenUsage;
  stepCount: number;

  // Step list with identifiable information
  steps: Array<{
    stepNumber: number;
    stepId: string;      // UUID for MCP queries
    stepName: string;
    stepType: string;
    status: string;
    duration: number;
    inputTokens?: number;
    outputTokens?: number;
    errorMessage?: string;
  }>;

  // Error summary
  hasErrors: boolean;
  errorCount: number;
  firstError?: {
    stepNumber: number;
    stepName: string;
    message: string;
  };

  /**
   * The run's own error message. A run can fail without a failed step — when the workflow it
   * handed to the task-graph dispatcher fails, the dispatcher records that here.
   */
  RunErrorMessage?: string;
  /**
   * The workflow this run handed to the task-graph dispatcher, when it did. Its failed tasks count
   * toward `errorCount`.
   */
  Workflow?: WorkflowTaskSummary;
}

/**
 * A run's token usage by bucket.
 *
 * `TotalPromptTokensUsed` (and `AIPromptRun.TokensPrompt`) count UNCACHED input only. With prompt
 * caching, most of a long prompt is a cache read, so on its own that column can read 4 for a prompt of
 * several thousand tokens. The input a model actually processed is the sum of all three buckets.
 */
export interface RunTokenUsage {
  /** Input not served from the provider's prompt cache — what `TotalPromptTokensUsed` stores. */
  UncachedInput: number;
  /** Input read from the provider's prompt cache. */
  CacheRead: number;
  /** Input written to the provider's prompt cache. */
  CacheWrite: number;
  /** All input the models processed: uncached + cache read + cache write. */
  TotalInput: number;
  /** Output (completion) tokens. */
  Output: number;
}

/** The token columns of an `MJ: AI Agent Runs` row that the audit reads. */
type RunTokenColumns = Pick<
  MJAIAgentRunEntity,
  'TotalTokensUsed' | 'TotalPromptTokensUsed' | 'TotalCompletionTokensUsed' | 'TotalCacheReadTokensUsed' | 'TotalCacheWriteTokensUsed'
>;

/**
 * Totals a run's token usage across all input buckets.
 *
 * A row written before the uncached/output split was recorded carries only `TotalTokensUsed`
 * (uncached input plus output); it gets that total plus its cache buckets, and no breakdown, rather
 * than a breakdown of zeros.
 */
export function SummarizeRunTokens(run: RunTokenColumns): { Tokens?: RunTokenUsage; TotalTokens: number } {
  const cacheRead = run.TotalCacheReadTokensUsed ?? 0;
  const cacheWrite = run.TotalCacheWriteTokensUsed ?? 0;
  if (run.TotalPromptTokensUsed == null && run.TotalCompletionTokensUsed == null) {
    return { TotalTokens: (run.TotalTokensUsed ?? 0) + cacheRead + cacheWrite };
  }
  const uncachedInput = run.TotalPromptTokensUsed ?? 0;
  const output = run.TotalCompletionTokensUsed ?? 0;
  const totalInput = uncachedInput + cacheRead + cacheWrite;
  return {
    Tokens: { UncachedInput: uncachedInput, CacheRead: cacheRead, CacheWrite: cacheWrite, TotalInput: totalInput, Output: output },
    TotalTokens: totalInput + output,
  };
}

export interface StepDetail {
  stepNumber: number;
  stepId: string;
  stepName: string;
  stepType: string;
  status: string;
  startedAt: string;
  completedAt?: string;
  duration: number;

  // Input/Output with smart truncation
  input: {
    raw: string;
    truncated: boolean;
    tokenCount: number;
    preview?: string; // First N chars
  };

  output: {
    raw: string;
    truncated: boolean;
    tokenCount: number;
    preview?: string;
  };

  // Tokens and cost
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;

  // Error details
  errorMessage?: string;
  stackTrace?: string;
}

export interface ErrorAnalysis {
  runId: string;
  agentName: string;
  errorCount: number;
  failedSteps: Array<{
    stepNumber: number;
    stepName: string;
    stepType: string;
    errorMessage: string;
    stackTrace?: string;

    // Context: step before failure
    previousStep?: {
      stepNumber: number;
      stepName: string;
      status: string;
      outputPreview: string; // First 500 chars
    };
  }>;

  // Pattern detection
  errorPattern?: string;
  suggestedFixes: string[];

  /** The run's own error message, when it has one. See {@link RunSummary.RunErrorMessage}. */
  RunErrorMessage?: string;
  /** Failed tasks of the workflow this run dispatched. Counted in `errorCount`. */
  FailedTasks?: WorkflowTaskInfo[];
}

/**
 * Service for auditing and analyzing AI Agent Run executions
 */
export class AgentAuditService {
  private initialized = false;
  private contextUser?: UserInfo;
  private analyzer: AuditAnalyzer;
  private formatter: AuditFormatter;

  constructor() {
    this.analyzer = new AuditAnalyzer();
    this.formatter = new AuditFormatter();
  }

  async Initialize(): Promise<void> {
    if (this.initialized) return;

    await InitializeMJProvider();
    this.contextUser = await this.getContextUser();
    this.initialized = true;
  }

  /** @deprecated Use {@link Initialize}. */
  async initialize(): Promise<void> {
    return this.Initialize();
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.Initialize();
    }
  }

  /**
   * List recent agent runs with filtering
   */
  async ListRecentRuns(options: ListRunsOptions): Promise<MJAIAgentRunEntity[]> {
    await this.ensureInitialized();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - options.days);

    let filter = `StartedAt >= '${startDate.toISOString()}' AND StartedAt <= '${endDate.toISOString()}'`;

    if (options.agentName) {
      filter += ` AND Agent LIKE '%${options.agentName.replace(/'/g, "''")}%'`;
    }

    if (options.status !== 'all') {
      // A successful run's status is 'Completed'. There is no 'Success' status, so mapping to it
      // made `--status success` match nothing.
      const statusMap: Record<ListRunsOptions['status'], MJAIAgentRunEntity['Status'] | null> = {
        success: 'Completed',
        failed: 'Failed',
        running: 'Running',
        all: null,
      };
      filter += ` AND Status = '${statusMap[options.status]}'`;
    }

    // Entity objects, as the return type promises. These were plain rows typed as entities, and
    // `--format json` called GetAll() on them and crashed.
    const rv = new RunView();
    const result = await rv.RunView<MJAIAgentRunEntity>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: filter,
      OrderBy: 'StartedAt DESC',
      MaxRows: options.limit,
      ResultType: 'entity_object',
    }, this.contextUser);

    if (!result.Success) {
      throw new Error(`Failed to load agent runs: ${result.ErrorMessage}`);
    }

    return result.Results || [];
  }

  /** @deprecated Use {@link ListRecentRuns}. */
  async listRecentRuns(options: ListRunsOptions): Promise<MJAIAgentRunEntity[]> {
    return this.ListRecentRuns(options);
  }

  /**
   * Get high-level summary of a run with step list
   */
  async GetRunSummary(runId: string, options: RunSummaryOptions): Promise<RunSummary> {
    await this.ensureInitialized();

    // Load run entity
    const md = new Metadata(); // global-provider-ok: CLI tool, single-provider context
    const runEntity = await md.GetEntityObject<MJAIAgentRunEntity>('MJ: AI Agent Runs', this.contextUser);
    const loaded = await runEntity.Load(runId);

    if (!loaded) {
      throw new Error(`Agent run not found: ${runId}`);
    }

    // Load all steps for this run
    const rv = new RunView();
    const stepsResult = await rv.RunView<MJAIAgentRunStepEntity>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID = '${runId}'`,
      OrderBy: 'StepNumber',
      ResultType: 'simple',
    }, this.contextUser);

    if (!stepsResult.Success) {
      throw new Error(`Failed to load steps: ${stepsResult.ErrorMessage}`);
    }

    const steps = stepsResult.Results || [];

    // Calculate metrics - note: token counts are at the run level, not step level
    const { Tokens: tokens, TotalTokens: totalTokens } = SummarizeRunTokens(runEntity);
    const recordedCost = runEntity.TotalCost ?? 0;

    const duration = runEntity.StartedAt && runEntity.CompletedAt
      ? new Date(runEntity.CompletedAt).getTime() - new Date(runEntity.StartedAt).getTime()
      : 0;

    const errorSteps = steps.filter(s => s.Status === 'Failed' || s.ErrorMessage);
    const firstError = errorSteps.length > 0 ? errorSteps[0] : undefined;
    const workflow = SummarizeWorkflowTasks(await this.loadWorkflowTasks(runEntity.ID));
    const errorCount = errorSteps.length + (workflow?.FailedTasks.length ?? 0);
    const runErrorMessage = runEntity.ErrorMessage || undefined;

    // Build summary
    const summary: RunSummary = {
      runId: runEntity.ID!,
      agentName: runEntity.Agent || 'Unknown',
      agentId: runEntity.AgentID!,
      status: runEntity.Status || 'Unknown',
      startedAt: runEntity.StartedAt?.toISOString() || '',
      completedAt: runEntity.CompletedAt?.toISOString(),
      duration,
      totalTokens,
      // A run with no cost row priced it as 0, so 0 means "not recorded", not "free".
      estimatedCost: recordedCost > 0 ? recordedCost : this.analyzer.estimateCost(totalTokens),
      CostSource: recordedCost > 0 ? 'Recorded' : 'Estimated',
      Tokens: tokens,
      stepCount: steps.length,
      hasErrors: errorCount > 0 || !!runErrorMessage,
      errorCount,
      RunErrorMessage: runErrorMessage,
      Workflow: workflow,
      steps: steps.map((step, index) => ({
        stepNumber: index + 1, // 1-based for user display
        stepId: step.ID!,
        stepName: step.StepName || `Step ${index + 1}`,
        stepType: step.StepType || 'Unknown',
        status: step.Status || 'Unknown',
        duration: this.analyzer.calculateStepDuration(step),
        inputTokens: undefined, // Token counts are not tracked per step
        outputTokens: undefined, // Token counts are not tracked per step
        errorMessage: step.ErrorMessage || undefined,
      })),
    };

    if (firstError) {
      summary.firstError = {
        stepNumber: steps.indexOf(firstError) + 1,
        stepName: firstError.StepName || 'Unknown',
        message: firstError.ErrorMessage || 'No error message',
      };
    }

    return summary;
  }

  /** @deprecated Use {@link GetRunSummary}. */
  async getRunSummary(runId: string, options: RunSummaryOptions): Promise<RunSummary> {
    return this.GetRunSummary(runId, options);
  }

  /**
   * Get detailed information for a specific step
   */
  async GetStepDetail(runId: string, stepNumber: number, options: StepDetailOptions): Promise<StepDetail> {
    await this.ensureInitialized();

    // Load all steps to find the right one by sequence
    const rv = new RunView();
    const result = await rv.RunView<MJAIAgentRunStepEntity>({
      EntityName: 'MJ: AI Agent Run Steps',
      ExtraFilter: `AgentRunID = '${runId}'`,
      OrderBy: 'StepNumber',
      ResultType: 'simple',
    }, this.contextUser);

    if (!result.Success) {
      throw new Error(`Failed to load steps: ${result.ErrorMessage}`);
    }

    const steps = result.Results || [];
    if (stepNumber < 1 || stepNumber > steps.length) {
      throw new Error(`Invalid step number: ${stepNumber} (run has ${steps.length} steps)`);
    }

    const step = steps[stepNumber - 1]; // Convert to 0-based index

    // Parse input/output JSON
    const inputRaw = step.InputData || '{}';
    const outputRaw = step.OutputData || '{}';

    const inputTokenCount = this.analyzer.estimateTokenCount(inputRaw);
    const outputTokenCount = this.analyzer.estimateTokenCount(outputRaw);

    // Apply truncation based on detail level and maxTokens
    const truncationRules = this.analyzer.getTruncationRules(options.detailLevel, options.maxTokens);

    const detail: StepDetail = {
      stepNumber,
      stepId: step.ID!,
      stepName: step.StepName || `Step ${stepNumber}`,
      stepType: step.StepType || 'Unknown',
      status: step.Status || 'Unknown',
      startedAt: step.StartedAt?.toISOString() || '',
      completedAt: step.CompletedAt?.toISOString(),
      duration: this.analyzer.calculateStepDuration(step),
      input: {
        raw: this.analyzer.truncateField(inputRaw, truncationRules.inputMaxChars),
        truncated: inputRaw.length > truncationRules.inputMaxChars,
        tokenCount: inputTokenCount,
        preview: inputRaw.substring(0, 500),
      },
      output: {
        raw: this.analyzer.truncateField(outputRaw, truncationRules.outputMaxChars),
        truncated: outputRaw.length > truncationRules.outputMaxChars,
        tokenCount: outputTokenCount,
        preview: outputRaw.substring(0, 500),
      },
      inputTokens: undefined, // Token counts not tracked at step level
      outputTokens: undefined, // Token counts not tracked at step level
      cost: undefined, // Cannot calculate cost without token counts
      errorMessage: step.ErrorMessage || undefined,
      stackTrace: undefined, // Stack trace not available in entity
    };

    return detail;
  }

  /** @deprecated Use {@link GetStepDetail}. */
  async getStepDetail(runId: string, stepNumber: number, options: StepDetailOptions): Promise<StepDetail> {
    return this.GetStepDetail(runId, stepNumber, options);
  }

  /**
   * Analyze all errors in a run with context
   */
  async AnalyzeErrors(runId: string): Promise<ErrorAnalysis> {
    await this.ensureInitialized();

    const summary = await this.GetRunSummary(runId, { includeStepList: true, maxTokens: 500 });

    const failedSteps = summary.steps.filter(s => s.status === 'Failed' || s.errorMessage);

    const failedStepDetails = await Promise.all(
      failedSteps.map(async (step) => {
        const detail = await this.GetStepDetail(runId, step.stepNumber, {
          detailLevel: 'standard',
          maxTokens: 1000,
        });

        // Get previous step context
        let previousStep;
        if (step.stepNumber > 1) {
          const prevDetail = await this.GetStepDetail(runId, step.stepNumber - 1, {
            detailLevel: 'minimal',
            maxTokens: 500,
          });
          previousStep = {
            stepNumber: step.stepNumber - 1,
            stepName: prevDetail.stepName,
            status: prevDetail.status,
            outputPreview: prevDetail.output.preview || '',
          };
        }

        return {
          stepNumber: step.stepNumber,
          stepName: step.stepName,
          stepType: step.stepType,
          errorMessage: detail.errorMessage || 'Unknown error',
          stackTrace: detail.stackTrace,
          previousStep,
        };
      })
    );

    // Detect error patterns, across the run's steps and its workflow's tasks
    const failedTasks = summary.Workflow?.FailedTasks ?? [];
    const errorMessages = [
      ...failedStepDetails.map(s => s.errorMessage),
      ...failedTasks.map(t => t.ErrorMessage || 'Unknown error'),
    ];
    const errorPattern = this.analyzer.detectErrorPattern(errorMessages);
    const suggestedFixes = this.analyzer.suggestFixes(errorPattern, failedStepDetails);

    return {
      runId,
      agentName: summary.agentName,
      errorCount: failedSteps.length + failedTasks.length,
      failedSteps: failedStepDetails,
      errorPattern,
      suggestedFixes,
      RunErrorMessage: summary.RunErrorMessage,
      FailedTasks: failedTasks,
    };
  }

  /** @deprecated Use {@link AnalyzeErrors}. */
  async analyzeErrors(runId: string): Promise<ErrorAnalysis> {
    return this.AnalyzeErrors(runId);
  }

  /**
   * Export full run data to file (no truncation)
   */
  async ExportRun(runId: string, exportType: 'full' | 'summary' | 'steps'): Promise<RunSummary | StepDetail[] | { summary: RunSummary; steps: StepDetail[] }> {
    await this.ensureInitialized();

    const summary = await this.GetRunSummary(runId, { includeStepList: true, maxTokens: 0 });

    if (exportType === 'summary') {
      return summary;
    }

    // Load full step details
    const stepDetails = await Promise.all(
      summary.steps.map(step =>
        this.GetStepDetail(runId, step.stepNumber, {
          detailLevel: 'full',
          maxTokens: 0, // No truncation for export
        })
      )
    );

    if (exportType === 'steps') {
      return stepDetails;
    }

    // Full export
    return {
      summary,
      steps: stepDetails,
    };
  }

  /** @deprecated Use {@link ExportRun}. */
  async exportRun(runId: string, exportType: 'full' | 'summary' | 'steps'): Promise<RunSummary | StepDetail[] | { summary: RunSummary; steps: StepDetail[] }> {
    return this.ExportRun(runId, exportType);
  }

  /**
   * Format run list for display
   */
  FormatRunList(runs: MJAIAgentRunEntity[], format: AuditOutputFormat): string {
    return this.formatter.formatRunList(runs, format);
  }

  /** @deprecated Use {@link FormatRunList}. */
  formatRunList(runs: MJAIAgentRunEntity[], format: AuditOutputFormat): string {
    return this.FormatRunList(runs, format);
  }

  /**
   * Format run summary for display
   */
  FormatRunSummary(summary: RunSummary, format: AuditOutputFormat): string {
    return this.formatter.formatRunSummary(summary, format);
  }

  /** @deprecated Use {@link FormatRunSummary}. */
  formatRunSummary(summary: RunSummary, format: AuditOutputFormat): string {
    return this.FormatRunSummary(summary, format);
  }

  /**
   * Format step detail for display
   */
  FormatStepDetail(detail: StepDetail, format: AuditOutputFormat): string {
    return this.formatter.formatStepDetail(detail, format);
  }

  /** @deprecated Use {@link FormatStepDetail}. */
  formatStepDetail(detail: StepDetail, format: AuditOutputFormat): string {
    return this.FormatStepDetail(detail, format);
  }

  /**
   * Format error analysis for display
   */
  FormatErrorAnalysis(analysis: ErrorAnalysis, format: AuditOutputFormat): string {
    return this.formatter.formatErrorAnalysis(analysis, format);
  }

  /** @deprecated Use {@link FormatErrorAnalysis}. */
  formatErrorAnalysis(analysis: ErrorAnalysis, format: AuditOutputFormat): string {
    return this.FormatErrorAnalysis(analysis, format);
  }

  /**
   * Loads the workflow a run handed to the task-graph dispatcher: the graph's parent task (the task
   * with this run's `AgentRunID` and no parent) and every task under it. Most runs dispatch nothing,
   * and for them this is one query that returns no rows.
   *
   * @param agentRunID - The run's ID as read from its record, never caller input, so it is safe to
   *   place in the filter.
   */
  private async loadWorkflowTasks(agentRunID: string): Promise<WorkflowTaskRow[]> {
    const rv = new RunView();
    const parents = await rv.RunView<WorkflowTaskRow>({
      EntityName: 'MJ: Tasks',
      ExtraFilter: `AgentRunID = '${agentRunID}' AND ParentID IS NULL`,
      Fields: WORKFLOW_TASK_FIELDS,
      ResultType: 'simple',
    }, this.contextUser);
    if (!parents.Success) {
      throw new Error(`Failed to load the workflow tasks of run ${agentRunID}: ${parents.ErrorMessage}`);
    }

    const parentRows = parents.Results || [];
    if (parentRows.length === 0) {
      return [];
    }

    const parentIDs = parentRows.map(parent => `'${parent.ID}'`).join(', ');
    const children = await rv.RunView<WorkflowTaskRow>({
      EntityName: 'MJ: Tasks',
      ExtraFilter: `RootParentID IN (${parentIDs}) AND ParentID IS NOT NULL`,
      Fields: WORKFLOW_TASK_FIELDS,
      OrderBy: '__mj_CreatedAt',
      ResultType: 'simple',
    }, this.contextUser);
    if (!children.Success) {
      throw new Error(`Failed to load the workflow tasks of run ${agentRunID}: ${children.ErrorMessage}`);
    }

    return [...parentRows, ...(children.Results || [])];
  }

  private async getContextUser(): Promise<UserInfo> {
    const { UserCache } = await import('@memberjunction/generic-database-provider');

    if (!UserCache.Users || UserCache.Users.length === 0) {
      throw new Error('No users found in UserCache');
    }

    return UserCache.Users[0];
  }
}
