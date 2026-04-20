import { Command, Flags } from '@oclif/core';

export default class Generate extends Command {
  static description = 'Generate SQL query templates for entities using AI';

  static examples = [
    `<%= config.bin %> <%= command.id %>`,
    `<%= config.bin %> <%= command.id %> --entities "Customers,Orders"`,
    `<%= config.bin %> <%= command.id %> --max-entities 5 --verbose`,
    `<%= config.bin %> <%= command.id %> --mode database`,
  ];

  static flags = {
    entities: Flags.string({
      char: 'e',
      description: 'Specific entities to generate queries for (comma-separated)',
      multiple: false
    }),
    'exclude-entities': Flags.string({
      char: 'x',
      description: 'Entities to exclude (comma-separated)',
      multiple: false
    }),
    'exclude-schemas': Flags.string({
      char: 's',
      description: 'Schemas to exclude (comma-separated)',
      multiple: false
    }),
    'max-entities': Flags.integer({
      char: 'm',
      description: 'Max entities per group',
      default: 3
    }),
    'target-groups': Flags.integer({
      char: 't',
      description: 'Target number of entity groups to generate',
      default: 75
    }),
    'max-refinements': Flags.integer({
      char: 'r',
      description: 'Max refinement iterations',
      default: 3
    }),
    'max-fixes': Flags.integer({
      char: 'f',
      description: 'Max error-fixing attempts',
      default: 5
    }),
    model: Flags.string({ description: 'Preferred AI model' }),
    vendor: Flags.string({ description: 'Preferred AI vendor' }),
    output: Flags.string({
      char: 'o',
      description: 'Output directory'
    }),
    mode: Flags.string({
      description: 'Output mode: metadata|database|both',
      options: ['metadata', 'database', 'both']
    }),
    verbose: Flags.boolean({ char: 'v', description: 'Verbose output' }),
  };

  async run(): Promise<void> {
    const { generateCommand } = await import('@memberjunction/query-gen');
    const { loadMJConfig, initializeProvider, getSystemUser } = await import('@memberjunction/metadata-sync');
    const { AIEngine } = await import('@memberjunction/aiengine');

    const { flags } = await this.parse(Generate);

    try {
      // Load MJ configuration and initialize provider
      const mjConfig = loadMJConfig();
      if (!mjConfig) {
        this.error('No mj.config.cjs found in current directory or parent directories');
      }

      await initializeProvider(mjConfig);

      // Get system user and initialize AI Engine
      const systemUser = getSystemUser();
      await AIEngine.Instance.Config(false, systemUser);

      // Convert flags to options object for QueryGen
      const options: Record<string, unknown> = {
        entities: flags.entities,
        excludeEntities: flags['exclude-entities'],
        excludeSchemas: flags['exclude-schemas'],
        maxEntities: flags['max-entities'],
        targetGroupCount: flags['target-groups'],
        maxRefinements: flags['max-refinements'],
        maxFixes: flags['max-fixes'],
        model: flags.model,
        vendor: flags.vendor,
        output: flags.output,
        mode: flags.mode,
        verbose: flags.verbose
      };

      // Call QueryGen generate command
      await generateCommand(options);

    } catch (error) {
      // QueryGen commands call process.exit(), so this may not be reached
      // But we handle it just in case
      this.error(error as Error);
    }
  }
}
