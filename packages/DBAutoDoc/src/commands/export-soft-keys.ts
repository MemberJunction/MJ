/**
 * Export Soft Keys command - Convert discovered relationships to soft PK/FK configuration
 */

import { Command, Flags } from '@oclif/core';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/**
 * Types from dbautodoc state.json
 */
interface DatabaseDocumentation {
  version: string;
  database: {
    name: string;
    server: string;
  };
  phases: {
    keyDetection?: RelationshipDiscoveryPhase;
  };
  schemas: SchemaDefinition[];
}

interface RelationshipDiscoveryPhase {
  discovered: {
    primaryKeys: PKCandidate[];
    foreignKeys: FKCandidate[];
  };
}

interface PKCandidate {
  schemaName: string;
  tableName: string;
  columnNames: string[];
  confidence: number;
  status: 'candidate' | 'confirmed' | 'rejected';
  validatedByLLM: boolean;
  evidence: {
    uniqueness: number;
    dataPattern: string;
    namingScore: number;
  };
}

interface FKCandidate {
  schemaName: string;
  sourceTable: string;
  sourceColumn: string;
  targetSchema: string;
  targetTable: string;
  targetColumn: string;
  confidence: number;
  status: 'candidate' | 'confirmed' | 'rejected';
  validatedByLLM: boolean;
  evidence: {
    valueOverlap: number;
    namingMatch: number;
    cardinalityRatio: number;
  };
}

interface SchemaDefinition {
  name: string;
  tables: TableDefinition[];
}

interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
}

interface ColumnDefinition {
  name: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignKeyReferences?: {
    schema: string;
    table: string;
    column: string;
  };
}

/**
 * Output format for CodeGen soft PK/FK configuration
 * CodeGen expects a flat "tables" array with camelCase properties
 */
interface SoftKeyConfig {
  $schema?: string;
  description: string;
  version: string;
  tables: TableConfig[];
}

interface TableConfig {
  schemaName: string;
  tableName: string;
  primaryKeys?: FieldConfig[];
  foreignKeys?: ForeignKeyConfig[];
}

interface FieldConfig {
  fieldName: string;
  description?: string;
}

interface ForeignKeyConfig extends FieldConfig {
  relatedSchema: string;
  relatedTable: string;
  relatedField: string;
}

interface ConversionStats {
  discoveredPKs: number;
  discoveredFKs: number;
  schemaPKs: number;
  schemaFKs: number;
  filteredPKs: number;
  filteredFKs: number;
  exportedPKs: number;
  exportedFKs: number;
  warnings: string[];
}

export default class ExportSoftKeys extends Command {
  static description = 'Convert dbautodoc discovered relationships to soft PK/FK configuration for CodeGen';

  static examples = [
    '$ db-auto-doc export-soft-keys --input ./db-doc-state.json --output ./config/soft-keys.json',
    '$ db-auto-doc export-soft-keys -i ./state.json -o ./soft-keys.json --min-confidence 80 --validated-only',
    '$ db-auto-doc export-soft-keys -i ./state.json -o ./soft-keys.json --status-filter confirmed --overwrite',
    '$ db-auto-doc export-soft-keys -i ./state.json -o ./soft-keys.json --source discovery',
    '$ db-auto-doc export-soft-keys -i ./state.json -o ./soft-keys.json --source schema',
  ];

  static flags = {
    input: Flags.string({
      description: 'Path to state.json file from dbautodoc',
      char: 'i',
      required: true,
    }),
    output: Flags.string({
      description: 'Output path for database-metadata-config.json',
      char: 'o',
      required: true,
    }),
    'min-confidence': Flags.integer({
      description: 'Minimum confidence threshold (0-100, only applies to discovered relationships)',
      default: 70,
    }),
    'validated-only': Flags.boolean({
      description: 'Only export LLM-validated relationships (only applies to discovered)',
      default: false,
    }),
    'status-filter': Flags.string({
      description: 'Comma-separated status filter (confirmed, candidate, rejected)',
      default: 'confirmed,candidate',
    }),
    overwrite: Flags.boolean({
      description: 'Overwrite existing output file',
      default: false,
    }),
    source: Flags.string({
      description: 'Data source: "discovery" (keyDetection phase), "schema" (existing FKs), or "auto" (try both)',
      options: ['discovery', 'schema', 'auto'],
      default: 'auto',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ExportSoftKeys);

    try {
      // Validate input file
      if (!fs.existsSync(flags.input)) {
        this.error(chalk.red(`Input file not found: ${flags.input}`));
      }

      // Check output file
      if (fs.existsSync(flags.output) && !flags.overwrite) {
        this.error(
          chalk.red(
            `Output file already exists: ${flags.output}\nUse --overwrite to replace it.`
          )
        );
      }

      // Load state.json
      this.log(chalk.blue('Loading state.json...'));
      const stateContent = fs.readFileSync(flags.input, 'utf-8');
      const state: DatabaseDocumentation = JSON.parse(stateContent);

      // Initialize stats
      const stats: ConversionStats = {
        discoveredPKs: 0,
        discoveredFKs: 0,
        schemaPKs: 0,
        schemaFKs: 0,
        filteredPKs: 0,
        filteredFKs: 0,
        exportedPKs: 0,
        exportedFKs: 0,
        warnings: [],
      };

      // Determine data source
      const hasDiscovery = state.phases?.keyDetection != null;
      const useDiscovery = flags.source === 'discovery' || (flags.source === 'auto' && hasDiscovery);
      const useSchema = flags.source === 'schema' || (flags.source === 'auto' && !hasDiscovery);

      if (flags.source === 'discovery' && !hasDiscovery) {
        this.error(
          chalk.red(
            'No relationship discovery phase found in state.json.\n' +
            'Run dbautodoc with relationship discovery enabled, or use --source auto/schema.'
          )
        );
      }

      this.log(chalk.blue(`Data source: ${useDiscovery ? 'Discovered relationships' : 'Schema FK constraints'}`));

      // Generate configuration
      const config: SoftKeyConfig = {
        $schema: './database-metadata-config.schema.json',
        description: useDiscovery
          ? `Auto-generated from dbautodoc relationship discovery (database: ${state.database.name})`
          : `Auto-generated from database schema FK constraints (database: ${state.database.name})`,
        version: '1.0',
        tables: [], // Initialize the flat tables array
      };

      if (useDiscovery) {
        this.convertDiscoveredRelationships(state, config, flags, stats);
      } else {
        this.convertSchemaRelationships(state, config, stats);
      }

      // Write output
      this.ensureDirectoryExists(path.dirname(flags.output));
      fs.writeFileSync(flags.output, JSON.stringify(config, null, 2), 'utf-8');

      // Print summary
      this.printSummary(stats, flags.output);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.error(chalk.red(`Failed to convert relationships: ${message}`));
    }
  }

  private convertDiscoveredRelationships(
    state: DatabaseDocumentation,
    config: SoftKeyConfig,
    flags: any,
    stats: ConversionStats
  ): void {
    const discovery = state.phases.keyDetection!;
    const statusFilter = flags['status-filter'].split(',').map((s: string) => s.trim());

    stats.discoveredPKs = discovery.discovered.primaryKeys.length;
    stats.discoveredFKs = discovery.discovered.foreignKeys.length;

    // Build table map with schema+table as key
    const tableMap = new Map<string, TableConfig>();

    // Process primary keys
    for (const pk of discovery.discovered.primaryKeys) {
      // Apply filters
      if (pk.confidence < flags['min-confidence']) {
        stats.filteredPKs++;
        continue;
      }

      if (flags['validated-only'] && !pk.validatedByLLM) {
        stats.filteredPKs++;
        continue;
      }

      if (!statusFilter.includes(pk.status)) {
        stats.filteredPKs++;
        continue;
      }

      // Warn about composite keys (not supported)
      if (pk.columnNames.length > 1) {
        stats.warnings.push(
          `Skipping composite PK on ${pk.schemaName}.${pk.tableName} (${pk.columnNames.join(', ')}) - not supported`
        );
        stats.filteredPKs++;
        continue;
      }

      // Add to config
      const tableConfig = this.getOrCreateTable(tableMap, pk.schemaName, pk.tableName);
      if (!tableConfig.primaryKeys) {
        tableConfig.primaryKeys = [];
      }

      const description = this.generatePKDescription(pk);
      tableConfig.primaryKeys.push({
        fieldName: pk.columnNames[0],
        description: description,
      });

      stats.exportedPKs++;
    }

    // Process foreign keys
    for (const fk of discovery.discovered.foreignKeys) {
      // Apply filters
      if (fk.confidence < flags['min-confidence']) {
        stats.filteredFKs++;
        continue;
      }

      if (flags['validated-only'] && !fk.validatedByLLM) {
        stats.filteredFKs++;
        continue;
      }

      if (!statusFilter.includes(fk.status)) {
        stats.filteredFKs++;
        continue;
      }

      // Add to config
      const tableConfig = this.getOrCreateTable(tableMap, fk.schemaName, fk.sourceTable);
      if (!tableConfig.foreignKeys) {
        tableConfig.foreignKeys = [];
      }

      const description = this.generateFKDescription(fk);
      tableConfig.foreignKeys.push({
        fieldName: fk.sourceColumn,
        relatedSchema: fk.targetSchema,
        relatedTable: fk.targetTable,
        relatedField: fk.targetColumn,
        description: description,
      });

      stats.exportedFKs++;
    }

    // Convert map to flat tables array
    this.mapToConfig(tableMap, config, stats);
  }

  private convertSchemaRelationships(
    state: DatabaseDocumentation,
    config: SoftKeyConfig,
    stats: ConversionStats
  ): void {
    // Build table map with schema+table as key
    const tableMap = new Map<string, TableConfig>();

    for (const schema of state.schemas) {
      for (const table of schema.tables) {
        for (const column of table.columns) {
          // Process primary keys
          if (column.isPrimaryKey) {
            stats.schemaPKs++;
            const tableConfig = this.getOrCreateTable(tableMap, schema.name, table.name);
            if (!tableConfig.primaryKeys) {
              tableConfig.primaryKeys = [];
            }
            tableConfig.primaryKeys.push({
              fieldName: column.name,
              description: 'Soft PK (from database schema)',
            });
            stats.exportedPKs++;
          }

          // Process foreign keys
          if (column.isForeignKey && column.foreignKeyReferences) {
            stats.schemaFKs++;
            const tableConfig = this.getOrCreateTable(tableMap, schema.name, table.name);
            if (!tableConfig.foreignKeys) {
              tableConfig.foreignKeys = [];
            }
            tableConfig.foreignKeys.push({
              fieldName: column.name,
              relatedSchema: column.foreignKeyReferences.schema,
              relatedTable: column.foreignKeyReferences.table,
              relatedField: column.foreignKeyReferences.column,
              description: 'Soft FK (from database schema)',
            });
            stats.exportedFKs++;
          }
        }
      }
    }

    // Convert map to flat tables array
    this.mapToConfig(tableMap, config, stats);
  }

  private getOrCreateTable(
    tableMap: Map<string, TableConfig>,
    schemaName: string,
    tableName: string
  ): TableConfig {
    const key = `${schemaName}.${tableName}`;

    if (!tableMap.has(key)) {
      tableMap.set(key, {
        schemaName: schemaName,
        tableName: tableName,
      });
    }

    return tableMap.get(key)!;
  }

  private mapToConfig(
    tableMap: Map<string, TableConfig>,
    config: SoftKeyConfig,
    stats: ConversionStats
  ): void {
    // Convert the map to a flat tables array
    config.tables = Array.from(tableMap.values());

    if (config.tables.length === 0) {
      stats.warnings.push('No relationships found matching the specified filters');
    }
  }

  private generatePKDescription(pk: PKCandidate): string {
    const parts: string[] = ['Soft PK'];

    parts.push(`confidence: ${pk.confidence}%`);

    if (pk.validatedByLLM) {
      parts.push('LLM validated');
    }

    if (pk.evidence.dataPattern !== 'unknown') {
      parts.push(`pattern: ${pk.evidence.dataPattern}`);
    }

    parts.push(`uniqueness: ${(pk.evidence.uniqueness * 100).toFixed(1)}%`);

    return `${parts.join(', ')}`;
  }

  private generateFKDescription(fk: FKCandidate): string {
    const parts: string[] = ['Soft FK'];

    parts.push(`confidence: ${fk.confidence}%`);

    if (fk.validatedByLLM) {
      parts.push('LLM validated');
    }

    parts.push(`value overlap: ${(fk.evidence.valueOverlap * 100).toFixed(1)}%`);

    if (fk.evidence.cardinalityRatio > 0) {
      parts.push(`cardinality: ${fk.evidence.cardinalityRatio.toFixed(2)}`);
    }

    return `${parts.join(', ')}`;
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private printSummary(stats: ConversionStats, outputPath: string): void {
    this.log('');
    this.log(chalk.green('✓ Export completed successfully'));
    this.log('');
    this.log(chalk.bold('Summary:'));

    if (stats.discoveredPKs > 0 || stats.discoveredFKs > 0) {
      this.log(chalk.gray(`  Discovered relationships:`));
      this.log(chalk.gray(`    Primary Keys: ${stats.discoveredPKs}`));
      this.log(chalk.gray(`    Foreign Keys: ${stats.discoveredFKs}`));
    }

    if (stats.schemaPKs > 0 || stats.schemaFKs > 0) {
      this.log(chalk.gray(`  Schema relationships:`));
      this.log(chalk.gray(`    Primary Keys: ${stats.schemaPKs}`));
      this.log(chalk.gray(`    Foreign Keys: ${stats.schemaFKs}`));
    }

    if (stats.filteredPKs > 0 || stats.filteredFKs > 0) {
      this.log(chalk.yellow(`  Filtered out:`));
      this.log(chalk.yellow(`    Primary Keys: ${stats.filteredPKs}`));
      this.log(chalk.yellow(`    Foreign Keys: ${stats.filteredFKs}`));
    }

    this.log(chalk.blue(`  Exported:`));
    this.log(chalk.blue(`    Primary Keys: ${stats.exportedPKs}`));
    this.log(chalk.blue(`    Foreign Keys: ${stats.exportedFKs}`));

    if (stats.warnings.length > 0) {
      this.log('');
      this.log(chalk.yellow('Warnings:'));
      for (const warning of stats.warnings) {
        this.log(chalk.yellow(`  • ${warning}`));
      }
    }

    this.log('');
    this.log(chalk.gray(`Output written to: ${outputPath}`));
    this.log('');
    this.log(chalk.gray('Next steps:'));
    this.log(chalk.gray(`  1. Review the generated configuration file`));
    this.log(chalk.gray(`  2. Update mj.config.cjs with: additionalSchemaInfo: "${path.relative(process.cwd(), outputPath)}"`));
    this.log(chalk.gray(`  3. Run CodeGen: mj codegen`));
  }
}
