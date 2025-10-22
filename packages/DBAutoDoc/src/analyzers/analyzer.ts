import { DatabaseConnection } from '../database/connection';
import { DatabaseIntrospector } from '../database/introspection';
import { StateManager } from '../state/state-manager';
import { SimpleAIClient as AIClient } from '../ai/simple-ai-client';
import ora from 'ora';

export interface AnalyzerOptions {
  schemas?: string[];
  excludeSchemas?: string[];
  interactive?: boolean;
  incremental?: boolean;
}

/**
 * Main analyzer orchestrating the documentation process
 */
export class DatabaseAnalyzer {
  constructor(
    private connection: DatabaseConnection,
    private stateManager: StateManager,
    private aiClient: AIClient
  ) {}

  /**
   * Analyze database and generate documentation
   */
  async analyze(options: AnalyzerOptions = {}): Promise<void> {
    const spinner = ora('Analyzing database...').start();

    try {
      const introspector = new DatabaseIntrospector(this.connection);

      // Get tables to process
      const tables = await introspector.getTables(options.schemas, options.excludeSchemas);

      spinner.succeed(`Found ${tables.length} tables`);

      let processed = 0;
      let skipped = 0;
      let totalTokens = 0;

      for (const tableInfo of tables) {
        const tableSpinner = ora(`Processing ${tableInfo.schema}.${tableInfo.table}`).start();

        try {
          // Check if already processed (incremental mode)
          if (options.incremental) {
            const state = this.stateManager.getState();
            const schema = state.schemas[tableInfo.schema];
            if (schema?.tables[tableInfo.table]?.aiGenerated) {
              tableSpinner.info(`Skipping ${tableInfo.schema}.${tableInfo.table} (already processed)`);
              skipped++;
              continue;
            }
          }

          // Get table details
          const [columns, foreignKeys, extProps, sampleData] = await Promise.all([
            introspector.getColumns(tableInfo.schema, tableInfo.table),
            introspector.getForeignKeys(tableInfo.schema, tableInfo.table),
            introspector.getExtendedProperties(tableInfo.schema, tableInfo.table),
            introspector.sampleData(tableInfo.schema, tableInfo.table, 5),
          ]);

          // Get existing description
          const existingDesc = extProps.find(p => p.objectType === 'TABLE')?.value;

          // Generate documentation with AI
          const aiDoc = await this.aiClient.generateTableDoc({
            schema: tableInfo.schema,
            table: tableInfo.table,
            columns: columns.map(c => ({
              name: c.name,
              type: c.dataType,
              nullable: c.isNullable,
              isPK: c.isPrimaryKey,
              isFK: c.isForeignKey,
            })),
            foreignKeys: foreignKeys.map(fk => ({
              column: fk.column,
              referencedTable: `${fk.referencedSchema}.${fk.referencedTable}`,
            })),
            sampleData,
            existingDescription: existingDesc,
          });

          // Update state with table documentation
          this.stateManager.updateTableAI(tableInfo.schema, tableInfo.table, {
            description: aiDoc.description,
            purpose: aiDoc.purpose,
            usageNotes: aiDoc.usageNotes,
            businessDomain: aiDoc.businessDomain,
            confidence: aiDoc.confidence,
            model: process.env.AI_MODEL || 'gpt-4',
            tokensUsed: aiDoc.tokensUsed,
            relationships: aiDoc.relationships,
          });

          // Update columns
          for (const colDoc of aiDoc.columns) {
            this.stateManager.updateColumnAI(
              tableInfo.schema,
              tableInfo.table,
              colDoc.name,
              {
                description: colDoc.description,
                purpose: colDoc.purpose,
                validValues: colDoc.validValues,
                confidence: colDoc.confidence,
                model: process.env.AI_MODEL || 'gpt-4',
              }
            );
          }

          if (aiDoc.tokensUsed) {
            totalTokens += aiDoc.tokensUsed;
          }

          processed++;
          tableSpinner.succeed(
            `Processed ${tableInfo.schema}.${tableInfo.table} (confidence: ${(aiDoc.confidence * 100).toFixed(0)}%)`
          );
        } catch (error) {
          tableSpinner.fail(`Failed to process ${tableInfo.schema}.${tableInfo.table}: ${error}`);
        }
      }

      // Save state
      await this.stateManager.save();

      // Add run history
      this.stateManager.addRunHistory({
        timestamp: new Date().toISOString(),
        phase: 'analyze',
        tablesProcessed: processed,
        tokensUsed: totalTokens,
        cost: totalTokens * 0.000002, // Rough estimate
      });

      await this.stateManager.save();

      console.log('');
      console.log(`✅ Analysis complete!`);
      console.log(`   Processed: ${processed} tables`);
      console.log(`   Skipped: ${skipped} tables`);
      console.log(`   Tokens used: ${totalTokens.toLocaleString()}`);
      console.log(`   Estimated cost: $${(totalTokens * 0.000002).toFixed(4)}`);
    } catch (error) {
      spinner.fail(`Analysis failed: ${error}`);
      throw error;
    }
  }
}
