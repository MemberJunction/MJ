import { Command, Flags } from '@oclif/core';
import { ParserOutput } from '@oclif/core/lib/interfaces/parser';
import { updatedConfig } from '../../config';
import { runMemberJunctionCodeGeneration, initializeConfig } from '@memberjunction/codegen-lib';

export default class CodeGen extends Command {
  static description = 'Run CodeGen to generate code and update metadata for MemberJunction';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    skipdb: Flags.boolean({ description: 'Skip database migration' }),
    'generate-all-sql': Flags.boolean({ 
      description: 'Generate all SQL objects to output file without execution',
      exclusive: ['generate-entity-sql'] 
    }),
    'generate-entity-sql': Flags.string({ 
      description: 'Generate SQL for a specific entity to output file',
      exclusive: ['generate-all-sql'] 
    }),
    'output-file': Flags.string({ 
      description: 'Output file path for SQL generation (required with --generate-all-sql or --generate-entity-sql)',
      dependsOn: ['generate-all-sql', 'generate-entity-sql']
    }),
  };

  flags: ParserOutput<CodeGen>['flags'];

  async run(): Promise<void> {
    const parsed = await this.parse(CodeGen);
    this.flags = parsed.flags;

    const config = updatedConfig();

    if (!config) {
      this.error('No configuration found');
    }

    // Initialize configuration
    initializeConfig(process.cwd());

    // Validate output file is provided when using generate flags
    if ((this.flags['generate-all-sql'] || this.flags['generate-entity-sql']) && !this.flags['output-file']) {
      this.error('--output-file is required when using --generate-all-sql or --generate-entity-sql');
    }

    // Call the function with the determined arguments
    runMemberJunctionCodeGeneration(this.flags.skipdb, {
      generateAllSQL: this.flags['generate-all-sql'],
      generateEntitySQL: this.flags['generate-entity-sql'],
      outputFile: this.flags['output-file'],
    });
  }
}
