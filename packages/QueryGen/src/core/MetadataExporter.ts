/**
 * MetadataExporter - Exports validated queries to MJ metadata format
 *
 * Transforms validated queries into MemberJunction metadata JSON files
 * that can be synced to the database using mj-sync.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ValidatedQuery, ExportResult, QueryMetadataRecord, BusinessQuestion } from '../data/schema';
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
   * and writes them to a timestamped JSON file.
   *
   * @param validatedQueries - Array of validated queries to export
   * @param outputDirectory - Directory to write the metadata file
   * @returns Export result with file path and query count
   */
  async exportQueries(
    validatedQueries: ValidatedQuery[],
    outputDirectory: string
  ): Promise<ExportResult> {
    // 1. Transform to MJ Query metadata format
    const metadata = validatedQueries.map(q => this.toQueryMetadata(q));

    // 2. Create metadata file structure
    const metadataFile = {
      timestamp: new Date().toISOString(),
      generatedBy: 'query-gen',
      version: '1.0',
      queries: metadata
    };

    // 3. Ensure output directory exists
    await fs.mkdir(outputDirectory, { recursive: true });

    // 4. Write to file
    const timestamp = Date.now();
    const outputPath = path.join(outputDirectory, `queries-${timestamp}.json`);
    await fs.writeFile(
      outputPath,
      JSON.stringify(metadataFile, null, 2),
      'utf-8'
    );

    return {
      success: true,
      outputPath,
      queryCount: metadata.length
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
    return {
      fields: {
        Name: generateQueryName(query.businessQuestion),
        CategoryID: '@lookup:Query Categories.Name=Auto-Generated',
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
}
