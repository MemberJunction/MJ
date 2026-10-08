import chalk from 'chalk';
import { table } from 'table';
import { MJAIAgentRunEntity } from '@memberjunction/core-entities';
import type { RunSummary, StepDetail, ErrorAnalysis } from '../services/AgentAuditService';
import type { WorkflowTaskInfo, WorkflowTaskSummary } from './workflow-tasks';

export type AuditOutputFormat = 'compact' | 'json' | 'table' | 'markdown';

/**
 * Utility class for formatting agent audit data for display
 */
export class AuditFormatter {
  /**
   * Format list of agent runs
   */
  FormatRunList(runs: MJAIAgentRunEntity[], format: AuditOutputFormat): string {
    if (runs.length === 0) {
      return chalk.yellow('No runs found matching the specified criteria.');
    }

    if (format === 'json') {
      return JSON.stringify(runs.map(r => r.GetAll()), null, 2);
    }

    if (format === 'table') {
      return this.formatRunListTable(runs);
    }

    // Compact format (default)
    return this.formatRunListCompact(runs);
  }

  /** @deprecated Use {@link FormatRunList}. */
  formatRunList(runs: MJAIAgentRunEntity[], format: AuditOutputFormat): string {
    return this.FormatRunList(runs, format);
  }

  /**
   * Format run list as compact text
   */
  private formatRunListCompact(runs: MJAIAgentRunEntity[]): string {
    let output = chalk.bold(`Found ${runs.length} run(s):\n\n`);

    runs.forEach(run => {
      const status = this.formatStatusIcon(run.Status || 'Unknown');
      const duration = this.calculateDuration(run.StartedAt, run.CompletedAt || undefined);

      output += `${status} ${chalk.cyan(run.ID!.substring(0, 8))} - ${run.Agent || 'Unknown'} (${duration})\n`;
      output += `  Started: ${run.StartedAt ? new Date(run.StartedAt).toLocaleString() : 'N/A'}\n\n`;
    });

    output += chalk.dim('\n💡 Use: mj ai audit agent-run <run-id> to see detailed audit\n');

    return output;
  }

  /**
   * Format run list as table
   */
  private formatRunListTable(runs: MJAIAgentRunEntity[]): string {
    const headers = [
      chalk.bold('Run ID'),
      chalk.bold('Agent'),
      chalk.bold('Status'),
      chalk.bold('Started'),
      chalk.bold('Duration'),
    ];

    const rows = runs.map(run => {
      const duration = this.calculateDuration(run.StartedAt, run.CompletedAt || undefined);
      const status = this.formatStatusText(run.Status || 'Unknown');

      return [
        run.ID!.substring(0, 8),
        run.Agent || 'Unknown',
        status,
        run.StartedAt ? new Date(run.StartedAt).toLocaleString() : 'N/A',
        duration,
      ];
    });

    return table([headers, ...rows]);
  }

  /**
   * Format run summary
   */
  FormatRunSummary(summary: RunSummary, format: AuditOutputFormat): string {
    if (format === 'json') {
      return JSON.stringify(summary, null, 2);
    }

    if (format === 'markdown') {
      return this.formatRunSummaryMarkdown(summary);
    }

    if (format === 'table') {
      return this.formatRunSummaryTable(summary);
    }

    // Compact format (default)
    return this.formatRunSummaryCompact(summary);
  }

  /** @deprecated Use {@link FormatRunSummary}. */
  formatRunSummary(summary: RunSummary, format: AuditOutputFormat): string {
    return this.FormatRunSummary(summary, format);
  }

  /**
   * Format run summary as compact text
   */
  private formatRunSummaryCompact(summary: RunSummary): string {
    let output = '';

    // Header
    output += chalk.bold.cyan('═══════════════════════════════════════════════\n');
    output += chalk.bold(`  Agent Run Audit: ${summary.agentName}\n`);
    output += chalk.bold.cyan('═══════════════════════════════════════════════\n\n');

    // Run Metadata
    output += chalk.bold('Run Metadata:\n');
    output += `  Run ID:      ${chalk.cyan(summary.runId)}\n`;
    output += `  Agent:       ${summary.agentName}\n`;
    output += `  Status:      ${this.formatStatusText(summary.status)}\n`;
    output += `  Started:     ${new Date(summary.startedAt).toLocaleString()}\n`;
    if (summary.completedAt) {
      output += `  Completed:   ${new Date(summary.completedAt).toLocaleString()}\n`;
    }
    output += `  Duration:    ${(summary.duration / 1000).toFixed(2)}s\n\n`;

    // Performance Metrics
    output += chalk.bold('Performance Metrics:\n');
    output += `  Total Steps:    ${summary.stepCount}\n`;
    output += `  Total Tokens:   ${summary.totalTokens.toLocaleString()}\n`;
    output += `  Estimated Cost: $${summary.estimatedCost.toFixed(4)}\n\n`;

    // Error Summary
    if (summary.hasErrors) {
      output += chalk.bold.red('⚠️  Errors Detected:\n');
      output += `  Error Count:    ${summary.errorCount}\n`;
      if (summary.RunErrorMessage) {
        output += `  Run Error:      ${chalk.red(summary.RunErrorMessage)}\n`;
      }
      if (summary.firstError) {
        output += `  First Error:    Step ${summary.firstError.stepNumber} - ${summary.firstError.stepName}\n`;
        output += `  Error Message:  ${chalk.red(summary.firstError.message.substring(0, 100))}\n`;
      }
      output += '\n';
    }

    output += this.formatWorkflowCompact(summary.Workflow);

    // Step List
    output += chalk.bold('Step Execution Summary:\n\n');

    const stepTableHeaders = [
      chalk.bold('#'),
      chalk.bold('Step ID'),
      chalk.bold('Name'),
      chalk.bold('Type'),
      chalk.bold('Status'),
      chalk.bold('Duration'),
      chalk.bold('Tokens'),
    ];

    const stepTableRows = summary.steps.map(step => [
      step.stepNumber.toString(),
      step.stepId.substring(0, 8),
      step.stepName.substring(0, 30),
      step.stepType,
      this.formatStatusText(step.status),
      `${(step.duration / 1000).toFixed(2)}s`,
      step.inputTokens && step.outputTokens
        ? `${step.inputTokens + step.outputTokens}`
        : 'N/A',
    ]);

    output += table([stepTableHeaders, ...stepTableRows]);

    // Footer tips
    output += '\n';
    output += chalk.dim('💡 Use --step <N> to see details for a specific step\n');
    output += chalk.dim('💡 Use --errors to see only error information\n');
    output += chalk.dim('💡 Use --export full --file report.json to export all data\n');

    return output;
  }

  /**
   * Format run summary as table
   */
  private formatRunSummaryTable(summary: RunSummary): string {
    let output = chalk.bold(`Agent Run: ${summary.agentName}\n\n`);

    // Metadata table
    const metadataHeaders = [chalk.bold('Property'), chalk.bold('Value')];
    const metadataRows = [
      ['Run ID', summary.runId.substring(0, 16) + '...'],
      ['Agent', summary.agentName],
      ['Status', this.formatStatusText(summary.status)],
      ['Duration', `${(summary.duration / 1000).toFixed(2)}s`],
      ['Total Steps', summary.stepCount.toString()],
      ['Total Tokens', summary.totalTokens.toLocaleString()],
      ['Est. Cost', `$${summary.estimatedCost.toFixed(4)}`],
      ...this.workflowTableRows(summary),
    ];

    output += table([metadataHeaders, ...metadataRows]);
    output += '\n';

    // Steps table
    const stepHeaders = [
      chalk.bold('#'),
      chalk.bold('Step ID'),
      chalk.bold('Name'),
      chalk.bold('Status'),
      chalk.bold('Duration'),
    ];

    const stepRows = summary.steps.map(step => [
      step.stepNumber.toString(),
      step.stepId.substring(0, 8),
      step.stepName.substring(0, 40),
      this.formatStatusText(step.status),
      `${(step.duration / 1000).toFixed(2)}s`,
    ]);

    output += table([stepHeaders, ...stepRows]);

    return output;
  }

  /**
   * Format run summary as markdown (for Claude Code consumption)
   */
  private formatRunSummaryMarkdown(summary: RunSummary): string {
    let md = '';

    md += `# Agent Run Audit: ${summary.agentName}\n\n`;

    md += `## Run Metadata\n`;
    md += `- **Run ID**: \`${summary.runId}\`\n`;
    md += `- **Agent**: ${summary.agentName}\n`;
    md += `- **Status**: ${summary.status}\n`;
    md += `- **Started**: ${new Date(summary.startedAt).toLocaleString()}\n`;
    if (summary.completedAt) {
      md += `- **Completed**: ${new Date(summary.completedAt).toLocaleString()}\n`;
    }
    md += `- **Duration**: ${(summary.duration / 1000).toFixed(2)}s\n\n`;

    md += `## Performance Metrics\n`;
    md += `- **Total Steps**: ${summary.stepCount}\n`;
    md += `- **Total Tokens**: ${summary.totalTokens.toLocaleString()}\n`;
    md += `- **Estimated Cost**: $${summary.estimatedCost.toFixed(4)}\n\n`;

    if (summary.hasErrors) {
      md += `## ⚠️ Errors Detected\n`;
      md += `- **Error Count**: ${summary.errorCount}\n`;
      if (summary.RunErrorMessage) {
        md += `- **Run Error**: ${summary.RunErrorMessage}\n`;
      }
      if (summary.firstError) {
        md += `- **First Error**: Step ${summary.firstError.stepNumber} - ${summary.firstError.stepName}\n`;
        md += `- **Error Message**: ${summary.firstError.message}\n`;
      }
      md += '\n';
    }

    md += this.formatWorkflowMarkdown(summary.Workflow);

    md += `## Step Execution Summary\n\n`;
    md += `| # | Step ID | Name | Type | Status | Duration | Tokens |\n`;
    md += `|---|---------|------|------|--------|----------|--------|\n`;

    summary.steps.forEach(step => {
      const tokens = step.inputTokens && step.outputTokens
        ? `${step.inputTokens + step.outputTokens}`
        : 'N/A';

      md += `| ${step.stepNumber} | \`${step.stepId.substring(0, 8)}\` | ${step.stepName} | ${step.stepType} | ${step.status} | ${(step.duration / 1000).toFixed(2)}s | ${tokens} |\n`;
    });

    md += '\n';
    md += `### Next Steps\n`;
    md += `- Use \`mj ai audit agent-run ${summary.runId} --step <N>\` to see details for a specific step\n`;
    md += `- Use \`mj ai audit agent-run ${summary.runId} --errors\` to see only error information\n`;

    return md;
  }

  /**
   * Format step detail
   */
  FormatStepDetail(detail: StepDetail, format: AuditOutputFormat): string {
    if (format === 'json') {
      return JSON.stringify(detail, null, 2);
    }

    if (format === 'markdown') {
      return this.formatStepDetailMarkdown(detail);
    }

    // Compact format (default)
    return this.formatStepDetailCompact(detail);
  }

  /** @deprecated Use {@link FormatStepDetail}. */
  formatStepDetail(detail: StepDetail, format: AuditOutputFormat): string {
    return this.FormatStepDetail(detail, format);
  }

  /**
   * Format step detail as compact text
   */
  private formatStepDetailCompact(detail: StepDetail): string {
    let output = '';

    output += chalk.bold.cyan('═══════════════════════════════════════════════\n');
    output += chalk.bold(`  Step ${detail.stepNumber}: ${detail.stepName}\n`);
    output += chalk.bold.cyan('═══════════════════════════════════════════════\n\n');

    output += chalk.bold('Step Metadata:\n');
    output += `  Step ID:     ${chalk.cyan(detail.stepId)}\n`;
    output += `  Type:        ${detail.stepType}\n`;
    output += `  Status:      ${this.formatStatusText(detail.status)}\n`;
    output += `  Started:     ${new Date(detail.startedAt).toLocaleString()}\n`;
    if (detail.completedAt) {
      output += `  Completed:   ${new Date(detail.completedAt).toLocaleString()}\n`;
    }
    output += `  Duration:    ${(detail.duration / 1000).toFixed(2)}s\n\n`;

    if (detail.inputTokens != null && detail.outputTokens != null) {
      output += chalk.bold('Token Usage:\n');
      output += `  Input:       ${detail.inputTokens.toLocaleString()}\n`;
      output += `  Output:      ${detail.outputTokens.toLocaleString()}\n`;
      output += `  Total:       ${(detail.inputTokens + detail.outputTokens).toLocaleString()}\n`;
      if (detail.cost != null) {
        output += `  Cost:        $${detail.cost.toFixed(4)}\n`;
      }
      output += '\n';
    }

    if (detail.errorMessage) {
      output += chalk.bold.red('Error Details:\n');
      output += chalk.red(`  ${detail.errorMessage}\n\n`);

      if (detail.stackTrace) {
        output += chalk.dim('Stack Trace:\n');
        output += chalk.dim(detail.stackTrace.split('\n').map(line => `  ${line}`).join('\n'));
        output += '\n\n';
      }
    }

    output += chalk.bold('Input Data:\n');
    if (detail.input.truncated) {
      output += chalk.yellow(`  ⚠️  Input truncated (${detail.input.tokenCount} tokens)\n`);
    }
    output += chalk.dim('─'.repeat(47)) + '\n';
    output += this.formatJson(detail.input.raw);
    output += chalk.dim('─'.repeat(47)) + '\n\n';

    output += chalk.bold('Output Data:\n');
    if (detail.output.truncated) {
      output += chalk.yellow(`  ⚠️  Output truncated (${detail.output.tokenCount} tokens)\n`);
    }
    output += chalk.dim('─'.repeat(47)) + '\n';
    output += this.formatJson(detail.output.raw);
    output += chalk.dim('─'.repeat(47)) + '\n\n';

    return output;
  }

  /**
   * Format step detail as markdown
   */
  private formatStepDetailMarkdown(detail: StepDetail): string {
    let md = '';

    md += `# Step ${detail.stepNumber}: ${detail.stepName}\n\n`;

    md += `## Metadata\n`;
    md += `- **Step ID**: \`${detail.stepId}\`\n`;
    md += `- **Type**: ${detail.stepType}\n`;
    md += `- **Status**: ${detail.status}\n`;
    md += `- **Duration**: ${(detail.duration / 1000).toFixed(2)}s\n\n`;

    if (detail.inputTokens != null && detail.outputTokens != null) {
      md += `## Token Usage\n`;
      md += `- **Input**: ${detail.inputTokens.toLocaleString()}\n`;
      md += `- **Output**: ${detail.outputTokens.toLocaleString()}\n`;
      md += `- **Total**: ${(detail.inputTokens + detail.outputTokens).toLocaleString()}\n`;
      if (detail.cost != null) {
        md += `- **Cost**: $${detail.cost.toFixed(4)}\n`;
      }
      md += '\n';
    }

    if (detail.errorMessage) {
      md += `## ⚠️ Error\n`;
      md += `${detail.errorMessage}\n\n`;

      if (detail.stackTrace) {
        md += `### Stack Trace\n`;
        md += `\`\`\`\n${detail.stackTrace}\n\`\`\`\n\n`;
      }
    }

    md += `## Input Data\n`;
    if (detail.input.truncated) {
      md += `*Input truncated (${detail.input.tokenCount} tokens)*\n\n`;
    }
    md += `\`\`\`json\n${detail.input.raw}\n\`\`\`\n\n`;

    md += `## Output Data\n`;
    if (detail.output.truncated) {
      md += `*Output truncated (${detail.output.tokenCount} tokens)*\n\n`;
    }
    md += `\`\`\`json\n${detail.output.raw}\n\`\`\`\n\n`;

    return md;
  }

  /**
   * Format error analysis
   */
  FormatErrorAnalysis(analysis: ErrorAnalysis, format: AuditOutputFormat): string {
    if (format === 'json') {
      return JSON.stringify(analysis, null, 2);
    }

    if (format === 'markdown') {
      return this.formatErrorAnalysisMarkdown(analysis);
    }

    // Compact format (default)
    return this.formatErrorAnalysisCompact(analysis);
  }

  /** @deprecated Use {@link FormatErrorAnalysis}. */
  formatErrorAnalysis(analysis: ErrorAnalysis, format: AuditOutputFormat): string {
    return this.FormatErrorAnalysis(analysis, format);
  }

  /**
   * Format error analysis as compact text
   */
  private formatErrorAnalysisCompact(analysis: ErrorAnalysis): string {
    let output = '';

    output += chalk.bold.red('═══════════════════════════════════════════════\n');
    output += chalk.bold.red(`  Error Analysis: ${analysis.agentName}\n`);
    output += chalk.bold.red('═══════════════════════════════════════════════\n\n');

    output += chalk.bold(`${this.describeErrorCounts(analysis)}\n\n`);

    if (analysis.RunErrorMessage) {
      output += chalk.bold('Run Error:\n');
      output += chalk.red(`  ${analysis.RunErrorMessage}\n\n`);
    }

    if (analysis.errorPattern) {
      output += chalk.bold('Common Error Pattern:\n');
      output += chalk.red(`  ${analysis.errorPattern}\n\n`);
    }

    // Failed steps
    analysis.failedSteps.forEach((step, index) => {
      output += chalk.bold(`\n${index + 1}. Step ${step.stepNumber}: ${step.stepName}\n`);
      output += `   Type: ${step.stepType}\n`;
      output += chalk.red(`   Error: ${step.errorMessage}\n`);

      if (step.previousStep) {
        output += chalk.dim(`   Previous Step: ${step.previousStep.stepNumber} - ${step.previousStep.stepName} (${step.previousStep.status})\n`);
        if (step.previousStep.outputPreview) {
          output += chalk.dim(`   Output Preview: ${step.previousStep.outputPreview.substring(0, 100)}...\n`);
        }
      }

      output += '\n';
    });

    if (analysis.FailedTasks && analysis.FailedTasks.length > 0) {
      output += chalk.bold('\nFailed Workflow Tasks:\n');
      output += this.formatFailedTasksCompact(analysis.FailedTasks);
    }

    // Suggested fixes
    if (analysis.suggestedFixes.length > 0) {
      output += chalk.bold.green('\n💡 Suggested Fixes:\n');
      analysis.suggestedFixes.forEach((fix, index) => {
        output += chalk.green(`  ${index + 1}. ${fix}\n`);
      });
    }

    return output;
  }

  /**
   * Format error analysis as markdown
   */
  private formatErrorAnalysisMarkdown(analysis: ErrorAnalysis): string {
    let md = '';

    md += `# Error Analysis: ${analysis.agentName}\n\n`;
    md += `${this.describeErrorCounts(analysis)}\n\n`;

    if (analysis.RunErrorMessage) {
      md += `## Run Error\n`;
      md += `${analysis.RunErrorMessage}\n\n`;
    }

    if (analysis.errorPattern) {
      md += `## Common Error Pattern\n`;
      md += `${analysis.errorPattern}\n\n`;
    }

    md += `## Failed Steps\n\n`;

    analysis.failedSteps.forEach((step, index) => {
      md += `### ${index + 1}. Step ${step.stepNumber}: ${step.stepName}\n`;
      md += `- **Type**: ${step.stepType}\n`;
      md += `- **Error**: ${step.errorMessage}\n`;

      if (step.previousStep) {
        md += `- **Previous Step**: ${step.previousStep.stepNumber} - ${step.previousStep.stepName} (${step.previousStep.status})\n`;
        if (step.previousStep.outputPreview) {
          md += `- **Output Preview**: ${step.previousStep.outputPreview.substring(0, 200)}\n`;
        }
      }

      md += '\n';
    });

    if (analysis.FailedTasks && analysis.FailedTasks.length > 0) {
      md += `## Failed Workflow Tasks\n\n`;
      md += this.formatFailedTasksMarkdown(analysis.FailedTasks);
      md += '\n';
    }

    if (analysis.suggestedFixes.length > 0) {
      md += `## 💡 Suggested Fixes\n\n`;
      analysis.suggestedFixes.forEach((fix, index) => {
        md += `${index + 1}. ${fix}\n`;
      });
      md += '\n';
    }

    return md;
  }

  /** "Found N failed step(s)", plus the failed workflow tasks when there are any. */
  private describeErrorCounts(analysis: ErrorAnalysis): string {
    const taskCount = analysis.FailedTasks?.length ?? 0;
    return taskCount > 0
      ? `Found ${analysis.failedSteps.length} failed step(s) and ${taskCount} failed workflow task(s)`
      : `Found ${analysis.failedSteps.length} failed step(s)`;
  }

  /**
   * The dispatched-workflow section of a compact summary: its status, its tasks by status, and each
   * task that failed. Nothing when the run dispatched no workflow.
   */
  private formatWorkflowCompact(workflow: WorkflowTaskSummary | undefined): string {
    if (!workflow) {
      return '';
    }
    let output = chalk.bold('Dispatched Workflow:\n');
    output += `  Status:         ${this.formatStatusText(workflow.Status)}\n`;
    output += `  Tasks:          ${workflow.TaskCount}${this.formatStatusCounts(workflow.StatusCounts)}\n`;
    if (workflow.FailedTasks.length > 0) {
      output += this.formatFailedTasksCompact(workflow.FailedTasks);
    }
    return output + '\n';
  }

  private formatFailedTasksCompact(tasks: WorkflowTaskInfo[]): string {
    return tasks.map(task => {
      let output = chalk.red(`  ✗ ${task.Name}`) + chalk.dim(` (${task.StepType ?? 'Task'} task ${task.TaskID})`) + '\n';
      output += chalk.red(`      ${task.ErrorMessage ?? 'No error message was recorded'}\n`);
      if (task.AgentRunID) {
        output += chalk.dim(`      Agent run ${task.AgentRunID}: mj ai audit agent-run ${task.AgentRunID} --errors\n`);
      }
      return output;
    }).join('');
  }

  private formatWorkflowMarkdown(workflow: WorkflowTaskSummary | undefined): string {
    if (!workflow) {
      return '';
    }
    let md = `## Dispatched Workflow\n`;
    md += `- **Status**: ${workflow.Status}\n`;
    md += `- **Tasks**: ${workflow.TaskCount}${this.formatStatusCounts(workflow.StatusCounts)}\n\n`;
    if (workflow.FailedTasks.length > 0) {
      md += `### Failed Tasks\n\n`;
      md += this.formatFailedTasksMarkdown(workflow.FailedTasks);
      md += '\n';
    }
    return md;
  }

  private formatFailedTasksMarkdown(tasks: WorkflowTaskInfo[]): string {
    return tasks.map((task, index) => {
      const run = task.AgentRunID ? ` (agent run \`${task.AgentRunID}\`)` : '';
      return `${index + 1}. **${task.Name}** — ${task.StepType ?? 'Task'} task \`${task.TaskID}\`${run}: ${task.ErrorMessage ?? 'No error message was recorded'}\n`;
    }).join('');
  }

  /** The table summary's rows for a dispatched workflow, if the run had one. */
  private workflowTableRows(summary: RunSummary): string[][] {
    const rows: string[][] = [];
    if (summary.RunErrorMessage) {
      rows.push(['Run Error', summary.RunErrorMessage]);
    }
    if (summary.Workflow) {
      rows.push(['Workflow Status', this.formatStatusText(summary.Workflow.Status)]);
      rows.push(['Workflow Tasks', `${summary.Workflow.TaskCount}${this.formatStatusCounts(summary.Workflow.StatusCounts)}`]);
      rows.push(['Failed Tasks', summary.Workflow.FailedTasks.map(task => `${task.Name}: ${task.ErrorMessage ?? 'no error message'}`).join('\n') || 'None']);
    }
    return rows;
  }

  /** ` (Complete 4, Failed 1)` — or nothing when there are no tasks. */
  private formatStatusCounts(counts: Record<string, number>): string {
    const parts = Object.entries(counts).map(([status, count]) => `${status} ${count}`);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }

  /**
   * Format status with color coding
   */
  private formatStatusText(status: string): string {
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'complete':
        return chalk.green('✓ Success');
      case 'failed':
      case 'error':
        return chalk.red('✗ Failed');
      case 'running':
      case 'in progress':
        return chalk.yellow('⟳ Running');
      default:
        return status;
    }
  }

  /**
   * Format status as icon
   */
  private formatStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'success':
      case 'completed':
        return chalk.green('✓');
      case 'failed':
      case 'error':
        return chalk.red('✗');
      case 'running':
      case 'in progress':
        return chalk.yellow('⟳');
      default:
        return '•';
    }
  }

  /**
   * Calculate and format duration
   */
  private calculateDuration(startedAt?: Date, completedAt?: Date): string {
    if (!startedAt || !completedAt) return 'N/A';
    const duration = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    return `${(duration / 1000).toFixed(1)}s`;
  }

  /**
   * Format JSON string with indentation
   */
  private formatJson(jsonString: string): string {
    if (!jsonString) return '  (empty)';

    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2)
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
    } catch {
      // Not valid JSON, return as-is
      return jsonString
        .split('\n')
        .map(line => `  ${line}`)
        .join('\n');
    }
  }
}
