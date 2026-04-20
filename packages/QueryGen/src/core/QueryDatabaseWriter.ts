/**
 * QueryDatabaseWriter - Write validated queries directly to the database
 *
 * Creates Query entities in the database. QueryFields and QueryParameters
 * are automatically extracted by MJQueryEntity.server.ts using AI analysis
 * of the SQL template during the Save() operation.
 */

import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
  MJQueryEntity,
  MJQueryCategoryEntity
} from '@memberjunction/core-entities';
import { ValidatedQuery, WriteResult } from '../data/schema';
import { extractErrorMessage } from '../utils/error-handlers';

/**
 * QueryDatabaseWriter class
 * Writes validated queries directly to the database
 */
export class QueryDatabaseWriter {
  private categoryCache: Map<string, string> = new Map();

  constructor() {
    // No config needed - category info comes from ValidatedQuery
  }
  /**
   * Write validated queries to the database
   *
   * Creates Query entities. QueryFields and QueryParameters are automatically
   * extracted by MJQueryEntity.server.ts using AI analysis of the SQL template.
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

    // Process each query
    for (const vq of validatedQueries) {
      try {
        // Get or create the category for this query (with caching)
        const categoryId = await this.getCategoryId(vq.category, contextUser);

        // Create Query entity ONLY (NO manual fields/params creation)
        // MJQueryEntity.server.ts will automatically:
        // - Detect Nunjucks syntax
        // - Extract parameters using AI
        // - Create QueryParameter records
        // - Create QueryField records
        // - Set UsesTemplate flag
        const query = await md.GetEntityObject<MJQueryEntity>('MJ: Queries', contextUser);
        query.NewRecord();
        query.Name = vq.query.queryName;
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
   * Get or create category ID from QueryCategoryInfo
   * Uses caching to avoid repeated lookups/creations
   * Ensures parent categories exist before creating children
   */
  private async getCategoryId(
    category: { name: string; parentName: string | null; description: string; path: string },
    contextUser: UserInfo
  ): Promise<string> {
    // Check cache first (by path for uniqueness)
    if (this.categoryCache.has(category.path)) {
      return this.categoryCache.get(category.path)!;
    }

    // If this category has a parent, ensure parent exists first
    let parentId: string | null = null;
    if (category.parentName) {
      // Create parent category info (it's a root category)
      const parentCategory = {
        name: category.parentName,
        parentName: null,
        description: 'Automatically generated queries from query-gen tool',
        path: category.parentName
      };
      parentId = await this.getCategoryId(parentCategory, contextUser);
    }

    // Find or create this category
    const categoryId = await this.findOrCreateCategory(
      category.name,
      parentId,
      category.description,
      contextUser
    );

    // Cache for future use
    this.categoryCache.set(category.path, categoryId);
    return categoryId;
  }

  /**
   * Find or create a query category
   *
   * Searches for an existing category with the given name and parent, or creates it if not found.
   *
   * @param categoryName - Name of the category to find or create
   * @param parentCategoryId - Parent category ID (null for root categories)
   * @param description - Description for new categories
   * @param contextUser - User context for entity operations
   * @returns Category ID
   */
  private async findOrCreateCategory(
    categoryName: string,
    parentCategoryId: string | null,
    description: string,
    contextUser: UserInfo
  ): Promise<string> {
    const rv = new RunView();

    // Build filter to match both name and parent
    let filter = `Name='${categoryName.replace(/'/g, "''")}'`;
    if (parentCategoryId) {
      filter += ` AND ParentID='${parentCategoryId}'`;
    } else {
      filter += ` AND ParentID IS NULL`;
    }

    const result = await rv.RunView<MJQueryCategoryEntity>({
      EntityName: 'MJ: Query Categories',
      ExtraFilter: filter,
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
    const category = await md.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', contextUser);
    category.NewRecord();
    category.Name = categoryName;
    category.ParentID = parentCategoryId;
    category.Description = description;

    const saved = await category.Save();
    if (!saved) {
      throw new Error(`Failed to create category: ${category.LatestResult?.Message}`);
    }

    return category.ID;
  }
}
