/**
 * MetadataExporter - Exports validated queries to MJ metadata format
 *
 * Transforms validated queries into MemberJunction metadata JSON files
 * that can be synced to the database using mj-sync.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ValidatedQuery, ExportResult, QueryMetadataRecord, QueryCategoryInfo } from '../data/schema';
import { QueryGenConfig } from '../cli/config';

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
   * - SQL/{query-name}.sql files if externalizeSQLToFiles is enabled
   *
   * @param validatedQueries - Array of validated queries to export
   * @param uniqueCategories - Pre-built unique categories for all queries
   * @param config - QueryGen configuration
   * @returns Export result with file path and query count
   */
  async exportQueries(
    validatedQueries: ValidatedQuery[],
    uniqueCategories: QueryCategoryInfo[],
    config: QueryGenConfig
  ): Promise<ExportResult> {
    // Generate shared timestamp for both files
    const timestamp = Date.now();

    const outputDirectory = config.outputDirectory;
    const categoryDir = config.outputCategoryDirectory || outputDirectory;

    // 1. If externalizing SQL, create SQL directory and write files
    if (config.externalizeSQLToFiles) {
      const sqlDir = path.join(outputDirectory, 'SQL');
      await fs.mkdir(sqlDir, { recursive: true });

      for (const query of validatedQueries) {
        const fileName = this.sanitizeFileName(query.query.queryName);
        const sqlFilePath = path.join(sqlDir, `${fileName}.sql`);
        await fs.writeFile(sqlFilePath, query.query.sql, 'utf-8');
      }
    }

    // 2. Transform to MJ metadata format
    const queryMetadata = validatedQueries.map(q => this.toQueryMetadata(q, config.externalizeSQLToFiles));
    const categoryMetadata = uniqueCategories.map(c => this.toCategoryMetadata(c));

    // 3. Ensure output directories exist
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
   * by MJQueryEntity.server.ts using AI analysis of the SQL template.
   * This happens asynchronously during the Save() operation.
   *
   * @param query - Validated query to transform
   * @param externalizeSQLToFiles - Whether SQL is externalized to separate files
   * @returns Query metadata record
   */
  private toQueryMetadata(query: ValidatedQuery, externalizeSQLToFiles: boolean): QueryMetadataRecord {
    // Build category lookup path (e.g., "Golden-Queries/Members" becomes lookup filter)
    const categoryLookup = this.buildCategoryLookup(query.category);

    // If externalizing SQL, use @file: reference; otherwise embed SQL directly
    const sqlValue = externalizeSQLToFiles
      ? `@file:SQL/${this.sanitizeFileName(query.query.queryName)}.sql`
      : query.query.sql;

    return {
      fields: {
        Name: query.query.queryName,
        CategoryID: categoryLookup,
        UserQuestion: query.businessQuestion.userQuestion,
        Description: query.businessQuestion.description,
        TechnicalDescription: query.businessQuestion.technicalDescription,
        SQL: sqlValue,
        UsesTemplate: true,
        Status: 'Pending'
      }
      // relatedEntities removed - MJQueryEntity.server.ts handles extraction automatically
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
          ? `@lookup:Query Categories.Name=${category.parentName}`
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

  /**
   * Sanitize query name for use as a file name
   * Removes or replaces characters that are invalid in file names
   *
   * @param queryName - The query name to sanitize
   * @returns Sanitized file name
   */
  private sanitizeFileName(queryName: string): string {
    return queryName
      .replace(/[<>:"/\\|?*]/g, '-') // Replace invalid file name characters with dash
      .replace(/\s+/g, '-')           // Replace spaces with dash
      .replace(/-+/g, '-')            // Replace multiple dashes with single dash
      .replace(/^-|-$/g, '')          // Remove leading/trailing dashes
      .toLowerCase();                 // Convert to lowercase for consistency
  }
}
