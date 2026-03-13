import { UserInfo, RunView, Metadata } from '@memberjunction/core';
import {
  MJAIAgentRunEntity,
  MJAIAgentRunStepEntity
} from '@memberjunction/core-entities';
import { initializeMJProvider } from '../lib/mj-provider';
import { AuditAnalyzer } from '../lib/audit-analyzer';
import { AuditFormatter, AuditOutputFormat } from '../lib/audit-formatter';

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
  totalTokens: number;
  estimatedCost: number;
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

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await initializeMJProvider();
    this.contextUser = await this.getContextUser();
    this.initialized = true;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * List recent agent runs with filtering
   */
  async listRecentRuns(options: ListRunsOptions): Promise<MJAIAgentRunEntity[]> {
    await this.ensureInitialized();

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - options.days);

    let filter = `StartedAt >= '${startDate.toISOString()}' AND StartedAt <= '${endDate.toISOString()}'`;

    if (options.agentName) {
      filter += ` AND Agent LIKE '%${options.agentName.replace(/'/g, "''")}%'`;
    }

    if (options.status !== 'all') {
      const statusMap: Record<string, string> = {
        success: 'Success',
        failed: 'Failed',
        running: 'Running',
      };
      filter += ` AND Status = '${statusMap[options.status]}'`;
    }

    const rv = new RunView();
    const result = await rv.RunView<MJAIAgentRunEntity>({
      EntityName: 'MJ: AI Agent Runs',
      ExtraFilter: filter,
      OrderBy: 'StartedAt DESC',
      MaxRows: options.limit,
      ResultType: 'simple',
    }, this.contextUser);

    if (!result.Success) {
      throw new Error(`Failed to load agent runs: ${result.ErrorMessage}`);
    }

    return result.Results || [];
  }

  /**
   * Get high-level summary of a run with step list
   */
  async getRunSummary(runId: string, options: RunSummaryOptions): Promise<RunSummary> {
    await this.ensureInitialized();

    // Load run entity
    const md = new Metadata();
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
    const totalTokens = runEntity.TotalTokensUsed || 0;

    const duration = runEntity.StartedAt && runEntity.CompletedAt
      ? new Date(runEntity.CompletedAt).getTime() - new Date(runEntity.StartedAt).getTime()
      : 0;

    const errorSteps = steps.filter(s => s.Status === 'Failed' || s.ErrorMessage);
    const firstError = errorSteps.length > 0 ? errorSteps[0] : undefined;

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
      estimatedCost: this.analyzer.estimateCost(totalTokens),
      stepCount: steps.length,
      hasErrors: errorSteps.length > 0,
      errorCount: errorSteps.length,
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

  /**
   * Get detailed information for a specific step
   */
  async getStepDetail(runId: string, stepNumber: number, options: StepDetailOptions): Promise<StepDetail> {
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

  /**
   * Analyze all errors in a run with context
   */
  async analyzeErrors(runId: string): Promise<ErrorAnalysis> {
    await this.ensureInitialized();

    const summary = await this.getRunSummary(runId, { includeStepList: true, maxTokens: 500 });

    const failedSteps = summary.steps.filter(s => s.status === 'Failed' || s.errorMessage);

    const failedStepDetails = await Promise.all(
      failedSteps.map(async (step) => {
        const detail = await this.getStepDetail(runId, step.stepNumber, {
          detailLevel: 'standard',
          maxTokens: 1000,
        });

        // Get previous step context
        let previousStep;
        if (step.stepNumber > 1) {
          const prevDetail = await this.getStepDetail(runId, step.stepNumber - 1, {
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

    // Detect error patterns
    const errorPattern = this.analyzer.detectErrorPattern(failedStepDetails.map(s => s.errorMessage));
    const suggestedFixes = this.analyzer.suggestFixes(errorPattern, failedStepDetails);

    return {
      runId,
      agentName: summary.agentName,
      errorCount: failedSteps.length,
      failedSteps: failedStepDetails,
      errorPattern,
      suggestedFixes,
    };
  }

  /**
   * Export full run data to file (no truncation)
   */
  async exportRun(runId: string, exportType: 'full' | 'summary' | 'steps'): Promise<RunSummary | StepDetail[] | { summary: RunSummary; steps: StepDetail[] }> {
    await this.ensureInitialized();

    const summary = await this.getRunSummary(runId, { includeStepList: true, maxTokens: 0 });

    if (exportType === 'summary') {
      return summary;
    }

    // Load full step details
    const stepDetails = await Promise.all(
      summary.steps.map(step =>
        this.getStepDetail(runId, step.stepNumber, {
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

  /**
   * Format run list for display
   */
  formatRunList(runs: MJAIAgentRunEntity[], format: AuditOutputFormat): string {
    return this.formatter.formatRunList(runs, format);
  }

  /**
   * Format run summary for display
   */
  formatRunSummary(summary: RunSummary, format: AuditOutputFormat): string {
    return this.formatter.formatRunSummary(summary, format);
  }

  /**
   * Format step detail for display
   */
  formatStepDetail(detail: StepDetail, format: AuditOutputFormat): string {
    return this.formatter.formatStepDetail(detail, format);
  }

  /**
   * Format error analysis for display
   */
  formatErrorAnalysis(analysis: ErrorAnalysis, format: AuditOutputFormat): string {
    return this.formatter.formatErrorAnalysis(analysis, format);
  }

  private async getContextUser(): Promise<UserInfo> {
    const { UserCache } = await import('@memberjunction/sqlserver-dataprovider');

    if (!UserCache.Users || UserCache.Users.length === 0) {
      throw new Error('No users found in UserCache');
    }

    return UserCache.Users[0];
  }
}
