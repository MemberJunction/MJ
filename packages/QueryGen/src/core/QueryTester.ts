/**
 * QueryTester - Tests and validates SQL queries
 *
 * Renders Nunjucks templates with sample parameter values and executes
 * queries against the database. Handles error fixing with retry loop.
 */

import nunjucks from 'nunjucks';
import {
  DatabaseProviderBase,
  RunQuerySQLFilterManager,
  UserInfo,
  LogError,
} from '@memberjunction/core';
import { extractErrorMessage } from '../utils/error-handlers';
import {
  GeneratedQuery,
  QueryTestResult,
  EntityMetadataForPrompt,
  BusinessQuestion,
} from '../data/schema';
import { QueryFixer } from './QueryFixer';
import { QueryGenConfig } from '../cli/config';

/**
 * QueryTester class
 * Tests SQL queries by rendering templates and executing against database
 */
export class QueryTester {
  private nunjucksEnv: nunjucks.Environment;

  constructor(
    private dataProvider: DatabaseProviderBase,
    private entityMetadata: EntityMetadataForPrompt[],
    private businessQuestion: BusinessQuestion,
    private contextUser: UserInfo,
    private config: QueryGenConfig
  ) {
    // Initialize Nunjucks environment with SQL-safe filters
    this.nunjucksEnv = new nunjucks.Environment(null, {
      autoescape: false,
      throwOnUndefined: true,
      trimBlocks: true,
      lstripBlocks: true,
    });

    // Add custom SQL-safe filters from RunQuerySQLFilterManager
    const filterManager = RunQuerySQLFilterManager.Instance;
    const filters = filterManager.getAllFilters();

    for (const filter of filters) {
      if (filter.implementation) {
        this.nunjucksEnv.addFilter(filter.name, filter.implementation);
      }
    }
  }

  /**
   * Test a query by rendering template with sample values and executing it
   * Retries up to maxAttempts times, calling QueryFixer on failures
   *
   * @param query - Generated query to test
   * @param maxAttempts - Maximum number of retry attempts (default: 5)
   * @returns Test result with success status, SQL, and sample data
   */
  async testQuery(
    query: GeneratedQuery,
    maxAttempts: number = 5
  ): Promise<QueryTestResult> {
    let attempt = 0;
    let lastError: string | undefined;
    let currentQuery = query;

    while (attempt < maxAttempts) {
      attempt++;

      try {
        // 1. Render template with sample parameter values
        const renderedSQL = this.renderQueryTemplate(currentQuery);

        // 2. Execute SQL on database
        const results = await this.executeSQLQuery(renderedSQL);

        // 3. Success! (Empty results are valid - query executed without errors)
        // Note: We don't validate rowCount because:
        // - Empty results may indicate no data in database (not a query error)
        // - Query structure can be correct even with zero rows returned
        // - Testing should focus on SQL syntax/execution, not data presence
        return {
          success: true,
          renderedSQL,
          rowCount: results.length,
          sampleRows: results.slice(0, 10), // Return first 10 rows
          attempts: attempt,
        };
      } catch (error: unknown) {
        lastError = extractErrorMessage(error, 'Query Testing');
        if (this.config.verbose) {
          LogError(`Attempt ${attempt}/${maxAttempts} failed: ${lastError}`);
        }

        // 5. If not last attempt, try to fix the query
        if (attempt < maxAttempts) {
          currentQuery = await this.fixQuery(currentQuery, lastError);
        }
      }
    }

    // Failed after max attempts
    return {
      success: false,
      error: lastError,
      attempts: maxAttempts,
    };
  }

  /**
   * Render query template with sample parameter values
   * Uses QueryParameterProcessor for proper type handling
   *
   * @param query - Generated query with parameters
   * @returns Rendered SQL string ready for execution
   */
  private renderQueryTemplate(query: GeneratedQuery): string {
    // Build parameter values object
    const paramValues: Record<string, unknown> = {};

    for (const param of query.parameters) {
      const rawValue = param.sampleValue;
      if (rawValue !== undefined && rawValue !== null) {
        paramValues[param.name] = this.processParameterValue(rawValue, param.type);
      }
    }

    try {
      // Render template using Nunjucks with SQL-safe filters
      const renderedSQL = this.nunjucksEnv.renderString(query.sql, paramValues);
      return renderedSQL;
    } catch (error: unknown) {
      throw new Error(
        `Template rendering failed: ${extractErrorMessage(error, 'Nunjucks')}`
      );
    }
  }

  /**
   * Processes a raw parameter value based on its type, handling special cases like arrays.
   * Follows Skip-Brain pattern for parameter processing.
   * For array types, this function will:
   * - Parse JSON arrays if the value is a JSON string
   * - Split comma-separated strings as a fallback
   * - Return as-is for sqlIn filter to handle
   *
   * @param rawValue - The raw parameter value (from sampleValue)
   * @param paramType - The parameter type ('string', 'number', 'date', 'boolean', 'array')
   * @returns Processed value ready for use in Nunjucks template
   */
  private processParameterValue(rawValue: unknown, paramType: string): unknown {
    if (rawValue === undefined || rawValue === null) {
      return rawValue;
    }

    // For array type parameters, ensure value is compatible with sqlIn filter
    if (paramType === 'array' && typeof rawValue === 'string') {
      try {
        // Try to parse as JSON array
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      } catch {
        // Not valid JSON - return as-is for sqlIn filter to handle comma-separated strings
      }
      // Return comma-separated string as-is - sqlIn filter handles this
      return rawValue;
    }

    // For non-array types, convert as needed
    switch (paramType) {
      case 'number':
        if (typeof rawValue === 'string') {
          const num = Number(rawValue);
          if (isNaN(num)) {
            throw new Error(`Invalid number sample value: ${rawValue}`);
          }
          return num;
        }
        return rawValue;

      case 'boolean':
        if (typeof rawValue === 'string') {
          const lower = rawValue.toLowerCase();
          if (lower !== 'true' && lower !== 'false') {
            throw new Error(`Invalid boolean sample value: ${rawValue}`);
          }
          return lower === 'true';
        }
        return rawValue;

      case 'date':
        if (typeof rawValue === 'string') {
          const date = new Date(rawValue);
          if (isNaN(date.getTime())) {
            throw new Error(`Invalid date sample value: ${rawValue}`);
          }
          return date;
        }
        return rawValue;

      case 'string':
      default:
        return rawValue;
    }
  }

  /**
   * Execute SQL query against database
   * Uses DataProvider to run query with contextUser
   *
   * @param sql - Rendered SQL query
   * @returns Array of result rows
   */
  private async executeSQLQuery(sql: string): Promise<unknown[]> {
    try {
      const result = await this.dataProvider.ExecuteSQL(
        sql,
        undefined,
        undefined,
        this.contextUser
      );

      if (!result || !Array.isArray(result)) {
        throw new Error('ExecuteSQL returned invalid result format');
      }

      return result;
    } catch (error: unknown) {
      throw new Error(
        `SQL execution failed: ${extractErrorMessage(error, 'Database')}`
      );
    }
  }

  /**
   * Fix a query that failed to execute
   * Uses QueryFixer with AI to analyze error and generate correction
   *
   * @param query - Query that failed
   * @param errorMessage - Error message from execution
   * @returns Corrected query
   */
  private async fixQuery(
    query: GeneratedQuery,
    errorMessage: string
  ): Promise<GeneratedQuery> {
    const fixer = new QueryFixer(this.contextUser, this.config);
    return await fixer.fixQuery(
      query,
      errorMessage,
      this.entityMetadata,
      this.businessQuestion
    );
  }
}
