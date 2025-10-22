import { Command, Flags } from '@oclif/core';
import { input, password, confirm } from '@inquirer/prompts';
import ora from 'ora-classic';
import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DatabaseConnection, StateManager } from '@memberjunction/db-auto-doc';

export default class Init extends Command {
  static description = 'Initialize database documentation project';

  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ];

  static flags = {
    interactive: Flags.boolean({
      description: 'Interactive setup',
      default: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    this.log(chalk.blue.bold('\n🚀 Database Documentation Generator\n'));

    try {
      let server: string;
      let database: string;
      let user: string;
      let pwd: string;

      if (flags.interactive) {
        server = await input({
          message: 'Database server:',
          default: 'localhost',
        });

        database = await input({
          message: 'Database name:',
          validate: (val) => (val ? true : 'Database name required'),
        });

        user = await input({
          message: 'Username:',
          default: 'sa',
        });

        pwd = await password({
          message: 'Password:',
          mask: '*',
        });
      } else {
        server = process.env.DB_SERVER || 'localhost';
        database = process.env.DB_DATABASE || '';
        user = process.env.DB_USER || 'sa';
        pwd = process.env.DB_PASSWORD || '';
      }

      // Test connection
      const spinner = ora('Testing database connection...').start();

      const connection = new DatabaseConnection({
        server,
        database,
        user,
        password: pwd,
        encrypt: true,
        trustServerCertificate: true,
      });

      const connected = await connection.test();

      if (!connected) {
        spinner.fail('Connection failed');
        this.exit(1);
      }

      spinner.succeed('Connection successful');

      // Create .env file
      const envPath = path.join(process.cwd(), '.env');
      const envContent = `
# Database Connection
DB_SERVER=${server}
DB_DATABASE=${database}
DB_USER=${user}
DB_PASSWORD=${pwd}
DB_ENCRYPT=true
DB_TRUST_SERVER_CERTIFICATE=true

# AI Configuration
AI_PROVIDER=openai
AI_MODEL=gpt-4
AI_API_KEY=your-api-key-here
`.trim();

      await fs.writeFile(envPath, envContent);
      this.log(chalk.green('✓ Created .env file'));

      // Create state file
      const stateManager = new StateManager();
      await stateManager.reset(server, database);
      this.log(chalk.green('✓ Created db-doc-state.json'));

      // Ask seed questions
      if (flags.interactive) {
        const addSeed = await confirm({
          message: 'Would you like to provide seed context?',
          default: true,
        });

        if (addSeed) {
          const purpose = await input({
            message: 'Overall database purpose:',
          });

          const domains = await input({
            message: 'Business domains (comma-separated):',
          });

          const state = stateManager.getState();
          state.seedContext = {
            overallPurpose: purpose,
            businessDomains: domains.split(',').map((d: string) => d.trim()),
          };
          await stateManager.save();

          this.log(chalk.green('✓ Saved seed context'));
        }
      }

      this.log(chalk.green.bold('\n✅ Initialization complete!\n'));
      this.log('Next steps:');
      this.log('  1. Edit .env and add your AI API key');
      this.log('  2. Run: mj dbdoc analyze');

      await connection.close();
    } catch (error: any) {
      this.error(error.message);
    }
  }
}
