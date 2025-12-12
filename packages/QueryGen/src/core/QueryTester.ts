/**
 * QueryTester - Tests and validates SQL queries
 *
 * Renders Nunjucks templates with sample parameter values and executes
 * queries against the database. Handles error fixing with retry loop.
 */

import * as nunjucks from 'nunjucks';
import {
  DatabaseProviderBase,
  RunQuerySQLFilterManager,
  UserInfo,
} from '@memberjunction/core';
import { extractErrorMessage } from '../utils/error-handlers';
import {
  GeneratedQuery,
  QueryTestResult,
  EntityMetadataForPrompt,
  BusinessQuestion,
} from '../data/schema';
import { QueryFixer } from './QueryFixer';

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
    private contextUser: UserInfo
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

        // 3. Validate results
        if (results.length === 0) {
          throw new Error(
            'Query returned no results - may need sample data in database'
          );
        }

        // 4. Success!
        return {
          success: true,
          renderedSQL,
          rowCount: results.length,
          sampleRows: results.slice(0, 10), // Return first 10 rows
          attempts: attempt,
        };
      } catch (error: unknown) {
        lastError = extractErrorMessage(error, 'Query Testing');
        console.error(`Attempt ${attempt}/${maxAttempts} failed:`, lastError);

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
   * Converts string sample values to proper types before rendering
   *
   * @param query - Generated query with parameters
   * @returns Rendered SQL string ready for execution
   */
  private renderQueryTemplate(query: GeneratedQuery): string {
    // Convert sample values to proper types
    const paramValues: Record<string, unknown> = {};

    for (const param of query.parameters) {
      paramValues[param.name] = this.parseSampleValue(
        param.sampleValue,
        param.type
      );
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
   * Parse sample value string to proper type
   * Handles number, boolean, date, and array conversions
   *
   * @param value - String representation of sample value
   * @param type - Target data type
   * @returns Parsed value in correct type
   */
  private parseSampleValue(value: string, type: string): unknown {
    switch (type) {
      case 'number':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Invalid number sample value: ${value}`);
        }
        return num;

      case 'boolean':
        const lower = value.toLowerCase();
        if (lower !== 'true' && lower !== 'false') {
          throw new Error(`Invalid boolean sample value: ${value}`);
        }
        return lower === 'true';

      case 'date':
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error(`Invalid date sample value: ${value}`);
        }
        return date;

      case 'array':
        try {
          return JSON.parse(value);
        } catch {
          throw new Error(`Invalid array sample value: ${value}`);
        }

      case 'string':
      default:
        return value;
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
    const fixer = new QueryFixer(this.contextUser);
    return await fixer.fixQuery(
      query,
      errorMessage,
      this.entityMetadata,
      this.businessQuestion
    );
  }
}
