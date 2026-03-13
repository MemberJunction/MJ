import { MJAIAgentRunStepEntity } from '@memberjunction/core-entities';

export interface TruncationRules {
  inputMaxChars: number;
  outputMaxChars: number;
}

/**
 * Utility class for analyzing agent run data and applying smart truncation
 */
export class AuditAnalyzer {
  /**
   * Estimate token count from string (rough approximation)
   * Uses the common rule of ~4 characters per token
   */
  estimateTokenCount(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost from token count (using average pricing)
   * Note: This uses an average rate and may not reflect actual costs
   */
  estimateCost(tokens: number): number {
    // Average: $0.01 per 1000 tokens (adjust based on actual model)
    return (tokens / 1000) * 0.01;
  }

  /**
   * Calculate step duration from entity timestamps
   */
  calculateStepDuration(step: MJAIAgentRunStepEntity): number {
    if (!step.StartedAt || !step.CompletedAt) return 0;
    return new Date(step.CompletedAt).getTime() - new Date(step.StartedAt).getTime();
  }

  /**
   * Get truncation rules based on detail level and max tokens
   */
  getTruncationRules(detailLevel: string, maxTokens: number): TruncationRules {
    const maxChars = maxTokens * 4; // Convert tokens to chars

    switch (detailLevel) {
      case 'minimal':
        return { inputMaxChars: 500, outputMaxChars: 500 };

      case 'standard':
        return { inputMaxChars: 2000, outputMaxChars: 2000 };

      case 'detailed':
        return { inputMaxChars: maxChars, outputMaxChars: maxChars };

      case 'full':
        return { inputMaxChars: Infinity, outputMaxChars: Infinity };

      default:
        return { inputMaxChars: 2000, outputMaxChars: 2000 };
    }
  }

  /**
   * Truncate field with smart preview (first + last chars)
   * Shows beginning and end of content with truncation indicator
   */
  truncateField(text: string, maxChars: number): string {
    if (!text || text.length <= maxChars || maxChars === Infinity) {
      return text || '';
    }

    const firstChars = Math.floor(maxChars * 0.7);
    const lastChars = Math.floor(maxChars * 0.3);
    const truncatedCount = text.length - maxChars;

    return (
      text.substring(0, firstChars) +
      `\n\n... [TRUNCATED ${truncatedCount} characters] ...\n\n` +
      text.substring(text.length - lastChars)
    );
  }

  /**
   * Detect common error patterns across multiple error messages
   * Finds the longest common substring that appears in all errors
   */
  detectErrorPattern(errorMessages: string[]): string | undefined {
    if (errorMessages.length === 0) return undefined;
    if (errorMessages.length === 1) return errorMessages[0];

    const first = errorMessages[0];

    // Try to find common substrings, starting with longest
    for (let len = Math.min(first.length, 200); len > 10; len--) {
      for (let start = 0; start <= first.length - len; start++) {
        const pattern = first.substring(start, start + len);

        if (errorMessages.every(msg => msg.includes(pattern))) {
          return pattern.trim();
        }
      }
    }

    // No common pattern found, return first error
    return errorMessages[0];
  }

  /**
   * Suggest fixes based on error pattern and failed step context
   * Analyzes error messages and provides actionable debugging suggestions
   */
  suggestFixes(errorPattern: string | undefined, failedSteps: Array<{ errorMessage: string; stepType: string }>): string[] {
    const suggestions: string[] = [];

    if (!errorPattern) return suggestions;

    const pattern = errorPattern.toLowerCase();

    // Common error patterns and their solutions
    if (pattern.includes('timeout')) {
      suggestions.push('Increase timeout value in agent configuration');
      suggestions.push('Check for slow database queries or API calls');
      suggestions.push('Consider breaking long-running operations into smaller steps');
    }

    if (pattern.includes('runview') || pattern.includes('entity')) {
      suggestions.push('Verify entity name matches exactly (check for "MJ: " prefix)');
      suggestions.push('Ensure contextUser is passed to RunView on server-side');
      suggestions.push('Check that the entity exists in the database schema');
    }

    if (pattern.includes('json') || pattern.includes('parse')) {
      suggestions.push('Check for malformed JSON in previous step output');
      suggestions.push('Validate prompt output format instructions');
      suggestions.push('Ensure proper escaping of special characters in JSON');
    }

    if (pattern.includes('null') || pattern.includes('undefined')) {
      suggestions.push('Add null checks for optional fields');
      suggestions.push('Verify data is loaded before accessing properties');
      suggestions.push('Check if required parameters are being passed correctly');
    }

    if (pattern.includes('permission') || pattern.includes('access')) {
      suggestions.push('Check user permissions for entity operations');
      suggestions.push('Verify security settings in entity metadata');
      suggestions.push('Ensure the context user has appropriate roles');
    }

    if (pattern.includes('model') || pattern.includes('llm')) {
      suggestions.push('Verify AI model is configured and available');
      suggestions.push('Check API keys and credentials for AI providers');
      suggestions.push('Ensure model supports the requested features');
    }

    if (pattern.includes('prompt') || pattern.includes('template')) {
      suggestions.push('Review prompt template for syntax errors');
      suggestions.push('Check that all required template variables are provided');
      suggestions.push('Validate prompt references exist in database');
    }

    // Step-type specific suggestions
    const stepTypes = failedSteps.map(s => s.stepType.toLowerCase());

    if (stepTypes.includes('data_gather') || stepTypes.includes('datagather')) {
      suggestions.push('Review entity filters and ensure proper SQL syntax');
      suggestions.push('Check that relationships between entities are correctly configured');
    }

    if (stepTypes.includes('write_script') || stepTypes.includes('writescript')) {
      suggestions.push('Validate generated script syntax');
      suggestions.push('Check that script dependencies are available');
    }

    // Generic suggestions if no specific pattern matched
    if (suggestions.length === 0) {
      suggestions.push('Review step input/output with --step <N> --detail full');
      suggestions.push('Check logs for previous step to identify data issues');
      suggestions.push('Verify agent prompt instructions are clear and complete');
      suggestions.push('Test with simpler inputs to isolate the problem');
    }

    return suggestions;
  }

  /**
   * Format duration in human-readable format
   */
  formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(2)}s`;
    } else if (milliseconds < 3600000) {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    } else {
      const hours = Math.floor(milliseconds / 3600000);
      const minutes = Math.floor((milliseconds % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * Calculate aggregate statistics for a collection of runs
   */
  calculateAggregateStats(runs: Array<{ duration: number; tokenCount: number; success: boolean }>): {
    totalRuns: number;
    successRate: number;
    avgDuration: number;
    totalTokens: number;
    avgTokens: number;
  } {
    const totalRuns = runs.length;
    const successCount = runs.filter(r => r.success).length;
    const successRate = totalRuns > 0 ? (successCount / totalRuns) * 100 : 0;

    const totalDuration = runs.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = totalRuns > 0 ? totalDuration / totalRuns : 0;

    const totalTokens = runs.reduce((sum, r) => sum + r.tokenCount, 0);
    const avgTokens = totalRuns > 0 ? totalTokens / totalRuns : 0;

    return {
      totalRuns,
      successRate,
      avgDuration,
      totalTokens,
      avgTokens,
    };
  }
}
