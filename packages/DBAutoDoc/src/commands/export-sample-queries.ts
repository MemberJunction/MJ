/**
 * Export Sample Queries command - Transform sample queries to MemberJunction metadata format
 */

import { Command, Flags } from '@oclif/core';
import ora from 'ora';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SampleQuery } from '../types/sample-queries.js';
import { DatabaseDocumentation } from '../types/state.js';
import * as crypto from 'crypto';

interface QueryMetadataRecord {
  fields: {
    Name: string;
    CategoryID: string | null;
    UserQuestion: string | null;
    Description: string | null;
    SQL: string;
    TechnicalDescription: string | null;
    OriginalSQL: string | null;
    Feedback: string | null;
    Status: 'Approved' | 'Pending' | 'Rejected' | 'Expired';
    QualityRank: number | null;
    ExecutionCostRank: number | null;
    UsesTemplate: boolean;
    AuditQueryRuns: boolean;
    CacheEnabled: boolean;
    CacheTTLMinutes: number | null;
    CacheMaxSize: number | null;
  };
  relatedEntities: Record<string, unknown>;
  primaryKey?: {
    ID: string;
  };
  sync?: {
    lastModified: string;
    checksum: string;
  };
}

export default class ExportSampleQueries extends Command {
  static description = 'Export sample queries to MemberJunction metadata format';

  static examples = [
    '$ db-auto-doc export-sample-queries --from-state ./output/run-1/state.json --output ./metadata/queries/.queries.json',
    '$ db-auto-doc export-sample-queries --from-state ./state.json --output ./metadata/queries/.queries.json --separate-sql-files',
    '$ db-auto-doc export-sample-queries --from-state ./state.json --output ./queries/.queries.json --category "Database Documentation"',
    '$ db-auto-doc export-sample-queries --from-state ./state.json --output ./queries/.queries.json --status Pending --min-confidence 0.8'
  ];

  static flags = {
    'from-state': Flags.string({
      char: 's',
      description: 'Path to state.json file containing sample queries',
      required: true
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output path for the .queries.json metadata file',
      required: true
    }),
    'separate-sql-files': Flags.boolean({
      description: 'Write SQL to separate files and use @file: references',
      default: false
    }),
    'sql-dir': Flags.string({
      description: 'Directory for SQL files when using --separate-sql-files (relative to output file)',
      default: 'SQL'
    }),
    category: Flags.string({
      description: 'Category name for @lookup reference (e.g., "Database Documentation")',
      required: false
    }),
    status: Flags.string({
      description: 'Status to assign to exported queries',
      options: ['Approved', 'Pending', 'Rejected', 'Expired'],
      default: 'Pending'
    }),
    'min-confidence': Flags.string({
      description: 'Minimum confidence threshold to export (0-1)',
      default: '0'
    }),
    'validated-only': Flags.boolean({
      description: 'Only export queries that were successfully validated',
      default: false
    }),
    append: Flags.boolean({
      description: 'Append to existing metadata file instead of overwriting',
      default: false
    }),
    'include-primary-key': Flags.boolean({
      description: 'Include primaryKey and sync fields (for updating existing records)',
      default: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ExportSampleQueries);
    const spinner = ora();

    try {
      // Load sample queries from state
      spinner.start('Loading sample queries from state');
      const statePath = path.resolve(flags['from-state']);
      const stateJson = await fs.readFile(statePath, 'utf-8');
      const state: DatabaseDocumentation = JSON.parse(stateJson);

      if (!state.sampleQueries || !state.sampleQueries.queries) {
        throw new Error('No sample queries found in state file. Run generate-queries first.');
      }

      const sampleQueries = state.sampleQueries.queries;
      spinner.succeed(`Loaded ${sampleQueries.length} sample queries from state`);

      // Filter queries based on flags
      const minConfidence = parseFloat(flags['min-confidence']);
      let filteredQueries = sampleQueries.filter(q => {
        if (flags['validated-only'] && !q.validated) {
          return false;
        }
        if (q.confidence < minConfidence) {
          return false;
        }
        return true;
      });

      this.log(`  Filtered to ${filteredQueries.length} queries (min confidence: ${minConfidence}, validated only: ${flags['validated-only']})`);

      // Prepare output directory
      const outputPath = path.resolve(flags.output);
      const outputDir = path.dirname(outputPath);
      await fs.mkdir(outputDir, { recursive: true });

      // Create SQL directory if using separate files
      let sqlDir: string | null = null;
      if (flags['separate-sql-files']) {
        sqlDir = path.join(outputDir, flags['sql-dir']);
        await fs.mkdir(sqlDir, { recursive: true });
        this.log(`  SQL files will be saved to: ${sqlDir}`);
      }

      // Load existing metadata if appending
      let existingRecords: QueryMetadataRecord[] = [];
      if (flags.append) {
        try {
          const existingJson = await fs.readFile(outputPath, 'utf-8');
          existingRecords = JSON.parse(existingJson);
          this.log(`  Appending to existing file with ${existingRecords.length} records`);
        } catch {
          // File doesn't exist, start fresh
          this.log(`  Output file doesn't exist, creating new file`);
        }
      }

      // Transform sample queries to metadata format
      spinner.start('Transforming queries to metadata format');
      const metadataRecords: QueryMetadataRecord[] = [];

      for (const query of filteredQueries) {
        const record = await this.transformToMetadata(
          query,
          flags.category || null,
          flags.status as 'Approved' | 'Pending' | 'Rejected' | 'Expired',
          flags['separate-sql-files'],
          sqlDir,
          flags['sql-dir'],
          flags['include-primary-key']
        );
        metadataRecords.push(record);
      }

      spinner.succeed(`Transformed ${metadataRecords.length} queries`);

      // Merge with existing records if appending
      const finalRecords = flags.append
        ? [...existingRecords, ...metadataRecords]
        : metadataRecords;

      // Write metadata file
      spinner.start('Writing metadata file');
      await fs.writeFile(
        outputPath,
        JSON.stringify(finalRecords, null, 2),
        'utf-8'
      );
      spinner.succeed(`Metadata saved to ${outputPath}`);

      // Summary
      this.log(chalk.green('\n✓ Export complete!'));
      this.log(`  Total queries exported: ${metadataRecords.length}`);
      this.log(`  Output file: ${outputPath}`);
      if (flags['separate-sql-files']) {
        this.log(`  SQL files: ${sqlDir}`);
      }

      // Show category lookup info
      if (flags.category) {
        this.log(`  Category: @lookup:Query Categories.Name=${flags.category}`);
      } else {
        this.log(chalk.yellow('  Note: No category specified. Set --category to assign a Query Category.'));
      }

      this.log(chalk.blue('\n  Next steps:'));
      this.log(`    1. Review the generated metadata at ${outputPath}`);
      this.log(`    2. Ensure the Query Category exists (or will be created)`);
      this.log(`    3. Run: npx mj-sync push ${outputDir}`);

    } catch (error) {
      spinner.fail('Export failed');
      this.error((error as Error).message);
    }
  }

  private async transformToMetadata(
    query: SampleQuery,
    category: string | null,
    status: 'Approved' | 'Pending' | 'Rejected' | 'Expired',
    separateSqlFiles: boolean,
    sqlDir: string | null,
    sqlDirName: string,
    includePrimaryKey: boolean
  ): Promise<QueryMetadataRecord> {
    let sqlValue: string;

    if (separateSqlFiles && sqlDir) {
      // Write SQL to separate file
      const sqlFileName = this.generateSqlFileName(query);
      const sqlFilePath = path.join(sqlDir, sqlFileName);
      await fs.writeFile(sqlFilePath, query.sqlQuery, 'utf-8');
      sqlValue = `@file:${sqlDirName}/${sqlFileName}`;
    } else {
      // Inline SQL
      sqlValue = query.sqlQuery;
    }

    // Build technical description from query metadata
    const technicalDescription = this.buildTechnicalDescription(query);

    // Determine if query uses template syntax (Nunjucks/parameters)
    const usesTemplate = this.detectTemplateUsage(query.sqlQuery, query.parameters);

    // Calculate quality and cost ranks based on query metadata
    const qualityRank = this.calculateQualityRank(query);
    const executionCostRank = this.calculateExecutionCostRank(query);

    const record: QueryMetadataRecord = {
      fields: {
        Name: this.sanitizeName(query.name),
        CategoryID: category ? `@lookup:Query Categories.Name=${category}` : null,
        UserQuestion: query.businessPurpose || null,
        Description: query.description || null,
        SQL: sqlValue,
        TechnicalDescription: technicalDescription,
        OriginalSQL: null,
        Feedback: null,
        Status: status,
        QualityRank: qualityRank,
        ExecutionCostRank: executionCostRank,
        UsesTemplate: usesTemplate,
        AuditQueryRuns: false,
        CacheEnabled: false,
        CacheTTLMinutes: null,
        CacheMaxSize: null
      },
      relatedEntities: {}
    };

    // Add primary key and sync if requested (for updating existing records)
    if (includePrimaryKey) {
      record.primaryKey = {
        ID: query.id || uuidv4()
      };
      record.sync = {
        lastModified: query.generatedAt || new Date().toISOString(),
        checksum: this.calculateChecksum(record.fields)
      };
    }

    return record;
  }

  private generateSqlFileName(query: SampleQuery): string {
    // Create a safe filename from the query name
    const safeName = query.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);

    return `${safeName}.sql`;
  }

  private sanitizeName(name: string): string {
    // Ensure name fits within database constraints and is valid
    return name.trim().substring(0, 255);
  }

  private buildTechnicalDescription(query: SampleQuery): string {
    const parts: string[] = [];

    // Query metadata
    parts.push(`**Query Type:** ${query.queryType}`);
    parts.push(`**Pattern:** ${query.queryPattern}`);
    parts.push(`**Complexity:** ${query.complexity}`);
    parts.push(`**Confidence:** ${(query.confidence * 100).toFixed(1)}%`);

    // Schema and entities
    parts.push(`\n**Schema:** ${query.schema}`);

    if (query.primaryEntities.length > 0) {
      const tables = query.primaryEntities.map(e => `${e.schema}.${e.table}`).join(', ');
      parts.push(`**Primary Tables:** ${tables}`);
    }

    if (query.relatedEntities.length > 0) {
      const tables = query.relatedEntities.map(e => `${e.schema}.${e.table}`).join(', ');
      parts.push(`**Related Tables:** ${tables}`);
    }

    // Business rules
    if (query.filteringRules.length > 0) {
      parts.push(`\n**Filtering Rules:**`);
      query.filteringRules.forEach(rule => parts.push(`- ${rule}`));
    }

    if (query.aggregationRules.length > 0) {
      parts.push(`\n**Aggregation Rules:**`);
      query.aggregationRules.forEach(rule => parts.push(`- ${rule}`));
    }

    if (query.joinRules.length > 0) {
      parts.push(`\n**Join Rules:**`);
      query.joinRules.forEach(rule => parts.push(`- ${rule}`));
    }

    // Parameters
    if (query.parameters.length > 0) {
      parts.push(`\n**Parameters:**`);
      query.parameters.forEach(param => {
        parts.push(`- @${param.name} (${param.dataType}): ${param.description}`);
        if (param.defaultValue) {
          parts.push(`  Default: ${param.defaultValue}`);
        }
      });
    }

    // Result columns
    if (query.sampleResultColumns.length > 0) {
      parts.push(`\n**Result Columns:**`);
      query.sampleResultColumns.forEach(col => {
        const flags: string[] = [];
        if (col.isMeasure) flags.push('Measure');
        if (col.isDimension) flags.push('Dimension');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        parts.push(`- ${col.name} (${col.dataType})${flagStr}: ${col.description}`);
      });
    }

    // Execution metadata
    if (query.executionTime) {
      parts.push(`\n**Execution Time:** ${query.executionTime}ms`);
    }

    if (query.wasRefined) {
      parts.push(`**Refinements:** ${query.refinementAttempts || 0} iteration(s)`);
    }

    if (query.fixAttempts && query.fixAttempts > 0) {
      parts.push(`**Fix Attempts:** ${query.fixAttempts}`);
    }

    // Generation info
    parts.push(`\n**Generated:** ${query.generatedAt}`);
    parts.push(`**Model:** ${query.modelUsed}`);

    if (query.reasoning) {
      parts.push(`\n**Generation Reasoning:** ${query.reasoning}`);
    }

    return parts.join('\n');
  }

  private detectTemplateUsage(sql: string, parameters: SampleQuery['parameters']): boolean {
    // Check for Nunjucks template markers
    if (sql.includes('{{') || sql.includes('{%')) {
      return true;
    }

    // Check for SQL parameters that would need template substitution
    if (parameters.length > 0) {
      // Check if any @param style parameters exist
      const paramPattern = /@\w+/g;
      if (paramPattern.test(sql)) {
        return true;
      }
    }

    return false;
  }

  private calculateQualityRank(query: SampleQuery): number {
    // Quality rank 1-10 based on confidence, validation, and refinement
    let rank = Math.round(query.confidence * 10);

    // Boost for successful validation
    if (query.validated) {
      rank = Math.min(10, rank + 1);
    }

    // Boost for refinement
    if (query.wasRefined && query.refinementAttempts && query.refinementAttempts > 0) {
      rank = Math.min(10, rank + 1);
    }

    // Penalty for fix attempts (indicates initial issues)
    if (query.fixAttempts && query.fixAttempts > 1) {
      rank = Math.max(1, rank - 1);
    }

    return rank;
  }

  private calculateExecutionCostRank(query: SampleQuery): number {
    // Execution cost rank 1-10 based on complexity and execution time
    let rank = 5; // Start at middle

    // Adjust based on complexity
    switch (query.complexity) {
      case 'simple':
        rank = 2;
        break;
      case 'moderate':
        rank = 5;
        break;
      case 'complex':
        rank = 8;
        break;
    }

    // Adjust based on execution time if available
    if (query.executionTime) {
      if (query.executionTime < 100) {
        rank = Math.max(1, rank - 2);
      } else if (query.executionTime < 500) {
        rank = Math.max(1, rank - 1);
      } else if (query.executionTime > 2000) {
        rank = Math.min(10, rank + 1);
      } else if (query.executionTime > 5000) {
        rank = Math.min(10, rank + 2);
      }
    }

    // Adjust based on query pattern
    if (query.queryPattern.includes('aggregation') || query.queryPattern.includes('ranking')) {
      rank = Math.min(10, rank + 1);
    }

    return rank;
  }

  private calculateChecksum(fields: QueryMetadataRecord['fields']): string {
    const content = JSON.stringify(fields);
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}
