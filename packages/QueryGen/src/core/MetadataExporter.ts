/**
 * MetadataExporter - Exports validated queries to MJ metadata format
 *
 * Transforms validated queries into MemberJunction metadata JSON files
 * that can be synced to the database using mj-sync.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ValidatedQuery, ExportResult, QueryMetadataRecord, QueryCategoryInfo } from '../data/schema';
import { generateQueryName } from '../utils/query-helpers';

/**
 * MetadataExporter class
 * Exports validated queries to MJ metadata JSON format
 */
export class MetadataExporter {
  /**
   * Export queries to metadata JSON files
   *
   * Transforms validated queries into MemberJunction metadata format
   * and writes them to timestamped JSON files:
   * - .query-categories-{timestamp}.json for the categories
   * - .queries-{timestamp}.json for the queries
   *
   * @param validatedQueries - Array of validated queries to export
   * @param uniqueCategories - Pre-built unique categories for all queries
   * @param outputDirectory - Directory to write the queries file
   * @param outputCategoryDirectory - Optional directory for categories file (defaults to outputDirectory)
   * @returns Export result with file path and query count
   */
  async exportQueries(
    validatedQueries: ValidatedQuery[],
    uniqueCategories: QueryCategoryInfo[],
    outputDirectory: string,
    outputCategoryDirectory?: string
  ): Promise<ExportResult> {
    // Generate shared timestamp for both files
    const timestamp = Date.now();

    // Use category directory if provided, otherwise use queries directory
    const categoryDir = outputCategoryDirectory || outputDirectory;

    // 1. Transform to MJ metadata format
    const queryMetadata = validatedQueries.map(q => this.toQueryMetadata(q));
    const categoryMetadata = uniqueCategories.map(c => this.toCategoryMetadata(c));

    // 2. Ensure output directories exist
    await fs.mkdir(outputDirectory, { recursive: true });
    if (categoryDir !== outputDirectory) {
      await fs.mkdir(categoryDir, { recursive: true });
    }

    // 3. Write categories file (if categories exist)
    if (categoryMetadata.length > 0) {
      const categoriesPath = path.join(categoryDir, `.query-categories-${timestamp}.json`);
      await fs.writeFile(
        categoriesPath,
        JSON.stringify(categoryMetadata, null, 2),
        'utf-8'
      );
    }

    // 4. Write queries file
    const outputPath = path.join(outputDirectory, `.queries-${timestamp}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(queryMetadata, null, 2),
      'utf-8'
    );

    return {
      success: true,
      outputPath,
      queryCount: queryMetadata.length
    };
  }

  /**
   * Transform a validated query into MJ metadata format
   *
   * Note: This method only creates the Query record.
   * QueryFields and QueryParameters are automatically extracted
   * by QueryEntity.server.ts using AI analysis of the SQL template.
   * This happens asynchronously during the Save() operation.
   *
   * @param query - Validated query to transform
   * @returns Query metadata record
   */
  private toQueryMetadata(query: ValidatedQuery): QueryMetadataRecord {
    // Build category lookup path (e.g., "Golden-Queries/Members" becomes lookup filter)
    const categoryLookup = this.buildCategoryLookup(query.category);

    return {
      fields: {
        Name: generateQueryName(query.businessQuestion),
        CategoryID: categoryLookup,
        UserQuestion: query.businessQuestion.userQuestion,
        Description: query.businessQuestion.description,
        TechnicalDescription: query.businessQuestion.technicalDescription,
        SQL: query.query.sql,
        OriginalSQL: query.query.sql,
        UsesTemplate: true,
        Status: 'Pending'
      }
      // relatedEntities removed - QueryEntity.server.ts handles extraction automatically
    };
  }

  /**
   * Transform a QueryCategoryInfo into MJ metadata format
   *
   * @param category - Category information
   * @returns Category metadata record
   */
  private toCategoryMetadata(category: QueryCategoryInfo) {
    return {
      fields: {
        Name: category.name,
        ParentID: category.parentName
          ? `@lookup:Query Categories.Name=${category.parentName}&ParentID=null`
          : null,
        Description: category.description,
        UserID: '@lookup:Users.Name=System'
      }
    };
  }

  /**
   * Build category lookup string for metadata
   * Uses multi-field lookup to uniquely identify categories in hierarchies
   *
   * For root categories: Name=X&ParentID=null
   * For child categories: Name=X&Parent=Y (where Parent is the parent category name)
   *
   * @param category - Category information
   * @returns Lookup string for CategoryID field
   */
  private buildCategoryLookup(category: QueryCategoryInfo): string {
    if (category.parentName) {
      // Child category - use Name and Parent field (view field showing parent name)
      return `@lookup:Query Categories.Name=${category.name}&Parent=${category.parentName}`;
    } else {
      // Root category - use Name and ParentID=null
      return `@lookup:Query Categories.Name=${category.name}&ParentID=null`;
    }
  }
}
