/**
 * QueryDatabaseWriter - Write validated queries directly to the database
 *
 * Provides an alternative to metadata files by directly creating
 * Query, Query Fields, and Query Parameters entities in the database.
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  QueryEntity,
  QueryFieldEntity,
  QueryParameterEntity,
  QueryCategoryEntity
} from '@memberjunction/core-entities';
import { ValidatedQuery, WriteResult, BusinessQuestion } from '../data/schema';
import { extractErrorMessage } from '../utils/error-handlers';

/**
 * QueryDatabaseWriter class
 * Writes validated queries directly to the database
 */
export class QueryDatabaseWriter {
  /**
   * Write validated queries to the database
   *
   * Creates Query entities with all related Query Fields and Query Parameters.
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
        // 1. Create Query entity
        const query = await md.GetEntityObject<QueryEntity>('Queries', contextUser);
        query.NewRecord();
        query.Name = this.generateQueryName(vq.businessQuestion);
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

        // 2. Create Query Fields
        for (let i = 0; i < vq.query.selectClause.length; i++) {
          const field = vq.query.selectClause[i];
          const qf = await md.GetEntityObject<QueryFieldEntity>('Query Fields', contextUser);
          qf.NewRecord();
          qf.QueryID = query.ID;
          qf.Name = field.name;
          qf.Description = field.description;
          qf.SQLBaseType = field.type;
          qf.SQLFullType = field.type;
          qf.Sequence = i + 1;
          qf.IsComputed = false;

          const fieldSaved = await qf.Save();
          if (!fieldSaved) {
            throw new Error(`Failed to save field ${field.name}: ${qf.LatestResult?.Message}`);
          }
        }

        // 3. Create Query Params
        for (let i = 0; i < vq.query.parameters.length; i++) {
          const param = vq.query.parameters[i];
          const qp = await md.GetEntityObject<QueryParameterEntity>('MJ: Query Parameters', contextUser);
          qp.NewRecord();
          qp.QueryID = query.ID;
          qp.Name = param.name;
          qp.Type = param.type as 'array' | 'boolean' | 'date' | 'number' | 'string';
          qp.Description = param.description;
          qp.IsRequired = param.isRequired;
          qp.DefaultValue = param.defaultValue;
          qp.ValidationFilters = param.usage.join(', ');
          qp.DetectionMethod = 'AI';

          const paramSaved = await qp.Save();
          if (!paramSaved) {
            throw new Error(`Failed to save param ${param.name}: ${qp.LatestResult?.Message}`);
          }
        }

        results.push(`✓ ${query.Name} (ID: ${query.ID})`);

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

  /**
   * Generate a concise query name from the user question
   *
   * Converts "What are the top customers by revenue?" to "Top Customers By Revenue"
   * Takes up to 5 meaningful words (longer than 2 characters) and capitalizes them.
   *
   * @param question - Business question to generate name from
   * @returns Generated query name
   */
  private generateQueryName(question: BusinessQuestion): string {
    return question.userQuestion
      .replace(/\?/g, '')
      .split(' ')
      .filter(word => word.length > 2)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .slice(0, 5)
      .join(' ');
  }
}
