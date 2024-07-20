import dotenv from 'dotenv';
dotenv.config();

import { runMemberJunctionCodeGeneration, initializeConfig } from '@memberjunction/codegen-lib';
import { Command, Flags } from '@oclif/core';
import { ParserOutput } from '@oclif/core/lib/interfaces/parser';

export default class Codegen extends Command {
  static description = 'Runs the MemberJunction code generation';

  static examples = [
    `<%= config.bin %> <%= command.id %>
`,
  ];

  static flags = {
    skipdb: Flags.boolean({ name: 'skipdb', description: 'Enable additional logging' }),
  };

  flags: ParserOutput<Codegen>['flags'];

  async run(): Promise<void> {
    const parsed = await this.parse(Codegen);
    this.flags = parsed.flags;

    // Initialize configuration
    initializeConfig(process.cwd());

    // Call the function with the determined argument
    runMemberJunctionCodeGeneration(this.flags.skipdb);
  }
}
