/**
 * Testing Framework Models
 * Shared interfaces and types for the testing framework
 */

/**
 * Represents a tag applied to a test run or test suite run.
 * Tags are stored as JSON arrays in the database.
 */
export interface TestTag {
  /** The tag value (e.g., "Opus 4.5", "GPT-4", "Production Config") */
  value: string;
  /** Optional category for grouping tags (e.g., "Model", "Environment", "Version") */
  category?: string;
  /** Optional color for display purposes (hex code) */
  color?: string;
}

/**
 * Helper functions for working with Tags JSON
 */
export class TagsHelper {
  /**
   * Parse tags from JSON string
   * @param tagsJson JSON string containing tags array
   * @returns Array of tag strings or TestTag objects
   */
  static parseTags(tagsJson: string | null | undefined): string[] {
    if (!tagsJson) return [];
    try {
      const parsed = JSON.parse(tagsJson);
      if (Array.isArray(parsed)) {
        return parsed.map(tag => typeof tag === 'string' ? tag : tag.value || String(tag));
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Parse tags as full TestTag objects
   * @param tagsJson JSON string containing tags array
   * @returns Array of TestTag objects
   */
  static parseTagObjects(tagsJson: string | null | undefined): TestTag[] {
    if (!tagsJson) return [];
    try {
      const parsed = JSON.parse(tagsJson);
      if (Array.isArray(parsed)) {
        return parsed.map(tag => {
          if (typeof tag === 'string') {
            return { value: tag };
          }
          return tag as TestTag;
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Convert tags array to JSON string for storage
   * @param tags Array of tag strings or TestTag objects
   * @returns JSON string
   */
  static toJson(tags: (string | TestTag)[]): string {
    const normalized = tags.map(tag => typeof tag === 'string' ? tag : tag.value);
    return JSON.stringify(normalized);
  }

  /**
   * Add a tag to an existing tags JSON string
   * @param tagsJson Existing tags JSON
   * @param newTag Tag to add
   * @returns Updated JSON string
   */
  static addTag(tagsJson: string | null | undefined, newTag: string): string {
    const tags = this.parseTags(tagsJson);
    if (!tags.includes(newTag)) {
      tags.push(newTag);
    }
    return JSON.stringify(tags);
  }

  /**
   * Remove a tag from an existing tags JSON string
   * @param tagsJson Existing tags JSON
   * @param tagToRemove Tag to remove
   * @returns Updated JSON string
   */
  static removeTag(tagsJson: string | null | undefined, tagToRemove: string): string {
    const tags = this.parseTags(tagsJson).filter(t => t !== tagToRemove);
    return JSON.stringify(tags);
  }

  /**
   * Get unique tags from multiple test runs
   * @param tagsJsonArray Array of tags JSON strings
   * @returns Unique sorted tags
   */
  static getUniqueTags(tagsJsonArray: (string | null | undefined)[]): string[] {
    const allTags = new Set<string>();
    for (const tagsJson of tagsJsonArray) {
      this.parseTags(tagsJson).forEach(tag => allTags.add(tag));
    }
    return Array.from(allTags).sort();
  }
}

/**
 * Analytics data point for charting
 */
export interface TestRunDataPoint {
  date: Date;
  passRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  avgDuration: number;
  totalCost: number;
  tags: string[];
  runId: string;
}

/**
 * Aggregated analytics for a time period
 */
export interface TestAnalyticsSummary {
  period: string;
  totalRuns: number;
  avgPassRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  avgDuration: number;
  totalCost: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
}

/**
 * Comparison data between two test suite runs
 */
export interface TestRunComparison {
  testId: string;
  testName: string;
  runA: {
    status: string;
    score: number | null;
    duration: number | null;
    cost: number | null;
  } | null;
  runB: {
    status: string;
    score: number | null;
    duration: number | null;
    cost: number | null;
  } | null;
  scoreDiff: number | null;
  durationDiff: number | null;
  statusChanged: boolean;
}

/**
 * Filter options for test analytics
 */
export interface TestAnalyticsFilter {
  dateRange?: {
    start: Date;
    end: Date;
  };
  tags?: string[];
  status?: string[];
  minPassRate?: number;
  maxPassRate?: number;
}

/**
 * Data for a single cell in the test results matrix
 */
export interface MatrixCellData {
  /** Test run ID for navigation */
  testRunId: string;
  /** Test ID */
  testId: string;
  /** Test name */
  testName: string;
  /** Test status */
  status: string;
  /** Test score (0-1) */
  score: number | null;
  /** Duration in seconds */
  duration: number | null;
  /** Cost in USD */
  cost: number | null;
}

/**
 * Data for a column (suite run) in the test results matrix
 */
export interface MatrixColumnData {
  /** Suite run ID */
  suiteRunId: string;
  /** Run date */
  date: Date;
  /** Tags for this run */
  tags: string[];
  /** Suite run status */
  status: string;
  /** Pass rate (0-100) */
  passRate: number;
  /** Map of testId to cell data */
  testResults: Map<string, MatrixCellData>;
}

/**
 * Data for a row (test) in the test results matrix
 */
export interface MatrixRowData {
  /** Test ID */
  testId: string;
  /** Test name */
  testName: string;
}

/**
 * Complete matrix data structure for the test results matrix component
 */
export interface TestResultsMatrixData {
  /** Columns (suite runs) - most recent first */
  columns: MatrixColumnData[];
  /** Rows (unique tests across all columns) */
  rows: MatrixRowData[];
}
