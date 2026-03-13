import { Command, Flags } from '@oclif/core';
import type { ParserOutput } from '@oclif/core/lib/interfaces/parser';
import { updatedConfig } from '../../config';

export default class CodeGen extends Command {
  static description = `Run the full MemberJunction code generation pipeline.

Analyzes your SQL Server database schema, updates MemberJunction metadata, and
generates synchronized code across the entire stack:

  - SQL views, stored procedures, indexes, and permissions
  - TypeScript entity classes with Zod validation schemas
  - Angular form components with AI-driven layouts
  - GraphQL resolvers and type definitions
  - Action subclasses and DB schema JSON

Configuration is loaded from mj.config.cjs in the current directory (or parent
directories). Database connection can also be set via environment variables:
DB_HOST, DB_DATABASE, CODEGEN_DB_USERNAME, CODEGEN_DB_PASSWORD.

Use --skipdb to skip all database operations (metadata sync, SQL object
generation) and only regenerate TypeScript, Angular, and GraphQL output from
existing metadata.`;

  static examples = [
    {
      command: '<%= config.bin %> <%= command.id %>',
      description: 'Run the full code generation pipeline',
    },
    {
      command: '<%= config.bin %> <%= command.id %> --skipdb',
      description: 'Regenerate code files without touching the database',
    },
  ];

  static flags = {
    skipdb: Flags.boolean({
      description: 'Skip database operations (metadata sync, SQL generation). Only regenerate TypeScript entities, Angular components, and GraphQL resolvers from existing metadata.',
    }),
  };

  flags: ParserOutput<CodeGen>['flags'];

  async run(): Promise<void> {
    const { runMemberJunctionCodeGeneration, initializeConfig } = await import('@memberjunction/codegen-lib');

    const parsed = await this.parse(CodeGen);
    this.flags = parsed.flags;

    const config = updatedConfig();

    if (!config) {
      this.error('No configuration found. Ensure mj.config.cjs exists in the current directory or a parent directory.');
    }

    // Initialize configuration
    initializeConfig(process.cwd());

    // Call the function with the determined argument
    runMemberJunctionCodeGeneration(this.flags.skipDb);
  }
}
