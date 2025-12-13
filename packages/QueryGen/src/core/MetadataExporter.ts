/**
 * MetadataExporter - Exports validated queries to MJ metadata format
 *
 * Transforms validated queries into MemberJunction metadata JSON files
 * that can be synced to the database using mj-sync.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { ValidatedQuery, ExportResult, QueryMetadataRecord, BusinessQuestion } from '../data/schema';

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
   * @param query - Validated query to transform
   * @returns Query metadata record
   */
  private toQueryMetadata(query: ValidatedQuery): QueryMetadataRecord {
    return {
      fields: {
        Name: this.generateQueryName(query.businessQuestion),
        CategoryID: '@lookup:Query Categories.Name=Auto-Generated',
        UserQuestion: query.businessQuestion.userQuestion,
        Description: query.businessQuestion.description,
        TechnicalDescription: query.businessQuestion.technicalDescription,
        SQL: query.query.sql,
        OriginalSQL: query.query.sql,
        UsesTemplate: true,
        Status: 'Pending'
      },
      relatedEntities: {
        'Query Fields': query.query.selectClause.map((field, i) => ({
          fields: {
            QueryID: '@parent:ID',
            Name: field.name,
            Description: field.description,
            SQLBaseType: field.type,
            Sequence: i + 1
          }
        })),
        'Query Params': query.query.parameters.map((param, i) => ({
          fields: {
            QueryID: '@parent:ID',
            Name: param.name,
            Type: param.type,
            Description: param.description,
            ValidationFilters: param.usage.join(', '),
            IsRequired: param.isRequired,
            DefaultValue: param.defaultValue,
            Sequence: i + 1
          }
        }))
      }
    };
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
