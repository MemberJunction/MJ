/**
 * QueryDatabaseWriter - Write validated queries directly to the database
 *
 * Creates Query entities in the database. QueryFields and QueryParameters
 * are automatically extracted by QueryEntity.server.ts using AI analysis
 * of the SQL template during the Save() operation.
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  QueryEntity,
  QueryCategoryEntity
} from '@memberjunction/core-entities';
import { ValidatedQuery, WriteResult, BusinessQuestion } from '../data/schema';
import { extractErrorMessage } from '../utils/error-handlers';
import { generateQueryName } from '../utils/query-helpers';

/**
 * QueryDatabaseWriter class
 * Writes validated queries directly to the database
 */
export class QueryDatabaseWriter {
  /**
   * Write validated queries to the database
   *
   * Creates Query entities. QueryFields and QueryParameters are automatically
   * extracted by QueryEntity.server.ts using AI analysis of the SQL template.
   * This happens asynchronously during the Save() operation.
   *
   * Errors for individual queries are logged but don't stop the batch process.
   *
   * @param validatedQueries - Array of validated queries to write
   * @param contextUser - User context for entity operations
   * @returns Write result with success status and per-query results
   */
  async writeQueriesToDatabase(
    validatedQueries: ValidatedQuery[],
    contextUser: UserInfo
  ): Promise<WriteResult> {
    const md = new Metadata();
    const results: string[] = [];

    // Get or create the Auto-Generated category once for all queries
    let categoryId: string;
    try {
      categoryId = await this.findOrCreateCategory('Auto-Generated', contextUser);
    } catch (error: unknown) {
      const errorMsg = extractErrorMessage(error, 'Category Setup');
      return {
        success: false,
        results: [`Failed to setup category: ${errorMsg}`]
      };
    }

    // Process each query
    for (const vq of validatedQueries) {
      try {
        // Create Query entity ONLY (NO manual fields/params creation)
        // QueryEntity.server.ts will automatically:
        // - Detect Nunjucks syntax
        // - Extract parameters using AI
        // - Create QueryParameter records
        // - Create QueryField records
        // - Set UsesTemplate flag
        const query = await md.GetEntityObject<QueryEntity>('Queries', contextUser);
        query.NewRecord();
        query.Name = generateQueryName(vq.businessQuestion);
        query.CategoryID = categoryId;
        query.UserQuestion = vq.businessQuestion.userQuestion;
        query.Description = vq.businessQuestion.description;
        query.TechnicalDescription = vq.businessQuestion.technicalDescription;
        query.SQL = vq.query.sql;
        query.OriginalSQL = vq.query.sql;
        query.Status = 'Pending';

        const saved = await query.Save();
        if (!saved) {
          throw new Error(`Failed to save query: ${query.LatestResult?.Message}`);
        }

        results.push(`✓ ${query.Name} (ID: ${query.ID}) - AI extraction queued`);

      } catch (error: unknown) {
        results.push(`✗ ${vq.businessQuestion.userQuestion}: ${extractErrorMessage(error, 'Database Write')}`);
      }
    }

    return {
      success: true,
      results
    };
  }

  /**
   * Find or create the Auto-Generated query category
   *
   * Searches for an existing category with the given name, or creates it if not found.
   *
   * @param categoryName - Name of the category to find or create
   * @param contextUser - User context for entity operations
   * @returns Category ID
   */
  private async findOrCreateCategory(
    categoryName: string,
    contextUser: UserInfo
  ): Promise<string> {
    const rv = new RunView();
    const result = await rv.RunView<QueryCategoryEntity>({
      EntityName: 'Query Categories',
      ExtraFilter: `Name='${categoryName.replace(/'/g, "''")}'`,
      ResultType: 'entity_object'
    }, contextUser);

    if (!result.Success) {
      throw new Error(`Failed to search for category: ${result.ErrorMessage}`);
    }

    // If found, return existing category ID
    if (result.Results && result.Results.length > 0) {
      return result.Results[0].ID;
    }

    // Category doesn't exist, create it
    const md = new Metadata();
    const category = await md.GetEntityObject<QueryCategoryEntity>('Query Categories', contextUser);
    category.NewRecord();
    category.Name = categoryName;
    category.Description = 'Automatically generated queries from query-gen tool';

    const saved = await category.Save();
    if (!saved) {
      throw new Error(`Failed to create category: ${category.LatestResult?.Message}`);
    }

    return category.ID;
  }
}
