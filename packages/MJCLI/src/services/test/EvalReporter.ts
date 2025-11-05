import chalk from 'chalk';
import {
  EvalDefinition,
  EvalExecutionResult,
  EvalReport,
  EvalRunSummary,
  EvalValidationResult,
  EvalFileInfo,
  OutputFormat,
} from './types';

/**
 * Service for formatting and reporting eval results
 */
export class EvalReporter {
  /**
   * Format single eval execution result for console
   */
  formatExecutionResult(evalDef: EvalDefinition, result: EvalExecutionResult): string {
    const lines: string[] = [];

    // Header
    lines.push('');
    lines.push(chalk.bold('╔══════════════════════════════════════════════════════════════╗'));
    lines.push(chalk.bold('║        Skip AI Analytics Agent Evaluation                   ║'));
    lines.push(chalk.bold('╚══════════════════════════════════════════════════════════════╝'));
    lines.push('');

    // Basic info
    lines.push(chalk.bold(`Running: ${evalDef.eval_id}`));
    lines.push(`Category: ${chalk.cyan(evalDef.category)}`);
    lines.push(`Difficulty: ${chalk.yellow(evalDef.difficulty)}`);
    lines.push(`Tags: ${evalDef.tags.map(t => chalk.magenta(t)).join(', ')}`);
    lines.push('');

    lines.push(chalk.gray('━'.repeat(64)));
    lines.push('');

    // Business context
    lines.push(chalk.bold('📋 Business Context'));
    lines.push(this.wrapText(evalDef.business_context, 64));
    lines.push('');

    lines.push(chalk.gray('━'.repeat(64)));
    lines.push('');

    // Prompt
    lines.push(chalk.bold('💬 Prompt'));
    lines.push(chalk.cyan(`"${evalDef.prompt}"`));
    lines.push('');

    lines.push(chalk.gray('━'.repeat(64)));
    lines.push('');

    // Data assertions results
    if (result.data_assertion_results.length > 0) {
      lines.push(chalk.bold('📊 Data Validation Results'));
      lines.push('');

      for (const assertion of result.data_assertion_results) {
        const icon = assertion.status === 'pass' ? chalk.green('✓') :
                     assertion.status === 'fail' ? chalk.red('✗') :
                     chalk.yellow('○');

        lines.push(`${icon} ${assertion.metric}`);

        if (assertion.expected_range) {
          lines.push(`  Expected: ${assertion.expected_range[0]}-${assertion.expected_range[1]}`);
        }
        if (assertion.actual_value !== undefined) {
          lines.push(`  Actual: ${assertion.actual_value}`);
        }
        if (assertion.message) {
          lines.push(`  ${chalk.gray(assertion.message)}`);
        }
        lines.push('');
      }

      lines.push(chalk.gray('━'.repeat(64)));
      lines.push('');
    }

    // Expected outcome
    lines.push(chalk.bold('📊 Expected Outcome'));
    lines.push('');

    lines.push(chalk.bold('Data Assertions:'));
    for (const assertion of evalDef.expected_outcome.data_assertions) {
      if (assertion.expected_range) {
        lines.push(`  • ${assertion.metric}: ${assertion.expected_range[0]}-${assertion.expected_range[1]}`);
      } else if (assertion.expected_value !== undefined) {
        lines.push(`  • ${assertion.metric}: ${assertion.expected_value}`);
      }
    }
    lines.push('');

    lines.push(chalk.bold('Visualization:'));
    lines.push(`  Preferred: ${chalk.cyan(evalDef.expected_outcome.visualization.type)}`);
    if (evalDef.expected_outcome.visualization.alternatives) {
      lines.push(`  Alternatives: ${evalDef.expected_outcome.visualization.alternatives.join(', ')}`);
    }
    if (evalDef.expected_outcome.visualization.should_not_be) {
      lines.push(`  Should NOT be: ${chalk.red(evalDef.expected_outcome.visualization.should_not_be.join(', '))}`);
    }
    lines.push(`  Reasoning: ${evalDef.expected_outcome.visualization.reasoning}`);
    lines.push('');

    lines.push(chalk.bold('Required Features:'));
    for (const feature of evalDef.expected_outcome.required_features) {
      lines.push(`  • ${feature}`);
    }
    lines.push('');

    if (evalDef.expected_outcome.optional_features && evalDef.expected_outcome.optional_features.length > 0) {
      lines.push(chalk.bold('Optional Features:'));
      for (const feature of evalDef.expected_outcome.optional_features) {
        lines.push(`  • ${feature}`);
      }
      lines.push('');
    }

    lines.push(chalk.gray('━'.repeat(64)));
    lines.push('');

    // Human validation checklist
    lines.push(chalk.bold('👤 Human Validation Checklist'));
    lines.push('');
    lines.push('Please verify the following:');
    lines.push('');

    for (const item of result.validation_checklist) {
      lines.push(`${chalk.yellow('[ ]')} ${item}`);
    }
    lines.push('');

    if (evalDef.common_pitfalls) {
      lines.push(chalk.bold('Common Pitfalls to Watch For:'));
      const pitfalls = evalDef.common_pitfalls.split(/[;.]/).filter(p => p.trim());
      for (const pitfall of pitfalls) {
        if (pitfall.trim()) {
          lines.push(`${chalk.red('•')} ${pitfall.trim()}`);
        }
      }
      lines.push('');
    }

    lines.push(chalk.gray('━'.repeat(64)));
    lines.push('');

    // Summary
    const statusColor = result.status === 'pass' ? chalk.green :
                       result.status === 'fail' ? chalk.red :
                       chalk.yellow;

    lines.push(`${chalk.bold('⏱️  Execution Time:')} ${result.execution_time_ms}ms`);
    lines.push(`${chalk.bold('📊 Automated Score:')} ${Math.round(result.automated_score * 100)}% (Data Correctness only)`);
    lines.push(`${chalk.bold('👤 Human Validation Required:')} ${result.requires_human_validation ? 'Yes' : 'No'}`);
    lines.push(`${chalk.bold('Status:')} ${statusColor(result.status.toUpperCase())}`);
    lines.push('');

    lines.push(chalk.gray('━'.repeat(64)));

    return lines.join('\n');
  }

  /**
   * Format validation result for console
   */
  formatValidationResult(result: EvalValidationResult, verbose: boolean = false): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold('╔══════════════════════════════════════════════════════════════╗'));
    lines.push(chalk.bold('║              AI Eval Validation Report                       ║'));
    lines.push(chalk.bold('╚══════════════════════════════════════════════════════════════╝'));
    lines.push('');

    // Summary box
    lines.push('┌────────────────────────────────────────────────────────────┐');
    lines.push(`│ Total Evals:    ${result.total_evals.toString().padEnd(42)} │`);
    lines.push(`│ Valid Evals:    ${chalk.green(result.valid_evals.toString()).padEnd(51)} │`);
    lines.push(`│ Errors:         ${chalk.red(result.errors.length.toString()).padEnd(51)} │`);
    lines.push(`│ Warnings:       ${chalk.yellow(result.warnings.length.toString()).padEnd(51)} │`);
    lines.push('└────────────────────────────────────────────────────────────┘');
    lines.push('');

    // Errors
    if (result.errors.length > 0) {
      lines.push(chalk.bold.red('Errors'));
      lines.push('');

      for (let i = 0; i < result.errors.length; i++) {
        const error = result.errors[i];
        lines.push(chalk.red(`${i + 1}. ${error.message}`));
        lines.push(`   Eval: ${chalk.cyan(error.eval_id)}`);
        lines.push(`   File: ${chalk.gray(error.file_path)}`);
        if (error.field) {
          lines.push(`   Field: ${error.field}`);
        }
        if (error.suggestion) {
          lines.push(`   ${chalk.yellow('→ Suggestion:')} ${error.suggestion}`);
        }
        lines.push('');
      }
    }

    // Warnings
    if (result.warnings.length > 0 && verbose) {
      lines.push(chalk.bold.yellow('Warnings'));
      lines.push('');

      for (let i = 0; i < result.warnings.length; i++) {
        const warning = result.warnings[i];
        lines.push(chalk.yellow(`${i + 1}. ${warning.message}`));
        lines.push(`   Eval: ${chalk.cyan(warning.eval_id)}`);
        if (warning.suggestion) {
          lines.push(`   ${chalk.gray('Suggestion:')} ${warning.suggestion}`);
        }
        lines.push('');
      }
    }

    // Final status
    if (result.is_valid) {
      lines.push(chalk.green.bold('✓ All evals validated successfully!'));
    } else {
      lines.push(chalk.red.bold('✗ Validation failed. Please fix errors above.'));
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Format eval list for console
   */
  formatEvalList(evals: EvalFileInfo[], verbose: boolean = false): string {
    const lines: string[] = [];

    lines.push('');
    lines.push(chalk.bold(`Found ${evals.length} eval(s):`));
    lines.push('');

    // Group by category
    const byCategory = this.groupBy(evals, e => e.category);

    for (const [category, categoryEvals] of Object.entries(byCategory)) {
      lines.push(chalk.bold.cyan(`${category.replace('_', ' ').toUpperCase()}:`));
      lines.push('');

      for (const evalInfo of categoryEvals) {
        const difficultyColor = this.getDifficultyColor(evalInfo.difficulty);
        lines.push(`  ${chalk.bold(evalInfo.eval_id)}`);
        lines.push(`    Difficulty: ${difficultyColor(evalInfo.difficulty)}`);
        lines.push(`    Tags: ${evalInfo.tags.map(t => chalk.magenta(t)).join(', ')}`);

        if (verbose) {
          lines.push(`    Prompt: ${chalk.gray(this.truncate(evalInfo.prompt, 80))}`);
          lines.push(`    File: ${chalk.gray(evalInfo.file_path)}`);
        }

        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Format results as JSON
   */
  formatAsJSON(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format results as markdown
   */
  formatAsMarkdown(results: EvalExecutionResult[], evalDefs: Map<string, EvalDefinition>): string {
    const lines: string[] = [];

    lines.push('# AI Eval Execution Report');
    lines.push('');
    lines.push(`Generated: ${new Date().toISOString()}`);
    lines.push('');

    // Summary
    const passed = results.filter(r => r.status === 'pass').length;
    const failed = results.filter(r => r.status === 'fail').length;
    const errors = results.filter(r => r.status === 'error').length;

    lines.push('## Summary');
    lines.push('');
    lines.push(`- **Total Evals:** ${results.length}`);
    lines.push(`- **Passed:** ${passed}`);
    lines.push(`- **Failed:** ${failed}`);
    lines.push(`- **Errors:** ${errors}`);
    lines.push('');

    // Individual results
    lines.push('## Eval Results');
    lines.push('');

    for (const result of results) {
      const evalDef = evalDefs.get(result.eval_id);
      if (!evalDef) continue;

      lines.push(`### ${result.eval_id}`);
      lines.push('');
      lines.push(`**Status:** ${result.status}`);
      lines.push(`**Category:** ${evalDef.category}`);
      lines.push(`**Difficulty:** ${evalDef.difficulty}`);
      lines.push(`**Execution Time:** ${result.execution_time_ms}ms`);
      lines.push(`**Automated Score:** ${Math.round(result.automated_score * 100)}%`);
      lines.push('');

      lines.push('**Prompt:**');
      lines.push(`> ${evalDef.prompt}`);
      lines.push('');

      if (result.validation_checklist.length > 0) {
        lines.push('**Human Validation Checklist:**');
        lines.push('');
        for (const item of result.validation_checklist) {
          lines.push(`- [ ] ${item}`);
        }
        lines.push('');
      }

      if (result.error_message) {
        lines.push(`**Error:** ${result.error_message}`);
        lines.push('');
      }

      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Helper: Wrap text to specified width
   */
  private wrapText(text: string, width: number): string {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length > width) {
        lines.push(currentLine.trim());
        currentLine = word + ' ';
      } else {
        currentLine += word + ' ';
      }
    }

    if (currentLine) {
      lines.push(currentLine.trim());
    }

    return lines.join('\n');
  }

  /**
   * Helper: Truncate text
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

  /**
   * Helper: Group array by key
   */
  private groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, T[]> {
    return array.reduce((result, item) => {
      const key = keyFn(item);
      if (!result[key]) {
        result[key] = [];
      }
      result[key].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }

  /**
   * Helper: Get color for difficulty
   */
  private getDifficultyColor(difficulty: string): (text: string) => string {
    switch (difficulty) {
      case 'easy': return chalk.green;
      case 'medium': return chalk.yellow;
      case 'hard': return chalk.red;
      case 'very_hard': return chalk.red.bold;
      default: return chalk.white;
    }
  }
}
