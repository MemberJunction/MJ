import { Command, Flags } from '@oclif/core';
import { select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import { StateManager } from '@memberjunction/db-auto-doc';

export default class Review extends Command {
  static description = 'Review and approve AI-generated documentation';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --schema dbo',
    '<%= config.bin %> <%= command.id %> --unapproved-only',
  ];

  static flags = {
    schema: Flags.string({
      description: 'Review specific schema',
    }),
    'unapproved-only': Flags.boolean({
      description: 'Only show unapproved items',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Review);

    this.log(chalk.blue.bold('\n📝 Review Documentation\n'));

    try {
      const stateManager = new StateManager();
      const state = await stateManager.load();

      const unapproved = stateManager.getUnapprovedTables(flags.schema);

      if (unapproved.length === 0) {
        this.log(chalk.green('✅ All tables approved!'));
        return;
      }

      this.log(`Found ${unapproved.length} unapproved tables\n`);

      for (const { schema, table } of unapproved) {
        const schemaState = state.schemas[schema];
        const tableState = schemaState.tables[table];

        this.log(chalk.cyan.bold(`\n${schema}.${table}`));
        this.log('─'.repeat(50));

        if (tableState.aiGenerated) {
          this.log(chalk.white('Description:'));
          this.log(tableState.aiGenerated.description);
          this.log('');
          this.log(chalk.gray(`Confidence: ${(tableState.aiGenerated.confidence * 100).toFixed(0)}%`));
        }

        const action = await select({
          message: 'Action:',
          choices: [
            { name: 'Approve', value: 'approve' },
            { name: 'Add notes', value: 'notes' },
            { name: 'Skip', value: 'skip' },
            { name: 'Exit review', value: 'exit' },
          ],
        });

        if (action === 'exit') {
          break;
        }

        if (action === 'approve') {
          stateManager.approveTable(schema, table);
          this.log(chalk.green('✓ Approved'));
        }

        if (action === 'notes') {
          const notes = await input({
            message: 'Enter notes:',
          });

          stateManager.addTableNotes(schema, table, notes);
          this.log(chalk.green('✓ Notes added'));
        }
      }

      await stateManager.save();
      this.log(chalk.green('\n✅ Review complete!'));
    } catch (error: any) {
      this.error(error.message);
    }
  }
}
