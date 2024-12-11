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

    // Call the function with the determined argument
    runMemberJunctionCodeGeneration(this.flags.skipDb);
  }
}
