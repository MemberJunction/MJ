import { existsSync } from 'node:fs';
import path from 'node:path';
import { Command, Flags } from '@oclif/core';
import { input, select } from '@inquirer/prompts';
import ora from 'ora-classic';
import {
  NonInteractiveError,
  isInteractiveRun,
  resolveOrPrompt,
  withNonInteractiveHandling,
} from '../../lib/interactive-guard.js';

export default class Init extends Command {
  static description = `Initialize a directory for metadata synchronization.

Non-interactive by default: pass --setup-entity (and --entity/--dir when setting up
"other") to run unattended. Add --human-friendly to be prompted for anything omitted.`;

  static examples = [
    { command: `<%= config.bin %> <%= command.id %> --setup-entity=no`, description: 'Initialize with no entity directory' },
    {
      command: `<%= config.bin %> <%= command.id %> --setup-entity=ai-prompts`,
      description: 'Initialize and set up the AI Prompts directory',
    },
    {
      command: `<%= config.bin %> <%= command.id %> --setup-entity=other --entity="MJ: AI Models" --dir=ai-models`,
      description: 'Initialize for an arbitrary entity',
    },
    { command: `<%= config.bin %> <%= command.id %> --human-friendly`, description: 'Prompt for each answer' },
  ];

  static flags = {
    'setup-entity': Flags.string({
      options: ['ai-prompts', 'other', 'no'],
      description: 'Which entity directory to set up. Use "no" to skip.',
    }),
    entity: Flags.string({ description: 'Entity name when --setup-entity=other (e.g. "MJ: AI Models").' }),
    dir: Flags.string({ description: 'Directory name when --setup-entity=other. Defaults to a slug of --entity.' }),
    overwrite: Flags.boolean({
      allowNo: true,
      description: 'Overwrite an existing configuration. Without this, an initialized directory is left untouched.',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);

    await withNonInteractiveHandling(this, async () => {
      const { InitService } = await import('@memberjunction/metadata-sync');

      const spinner = ora();

      try {
        // Check if already initialized
        const initService = new InitService();

        // Build options from user input
        const options: Parameters<typeof initService.initialize>[0] = {};

        // Only an ALREADY-initialized directory raises the overwrite question. The
        // previous version asked unconditionally — harmless while the answer was a
        // prompt a human could dismiss, but fatal once a missing answer became an
        // error, since a first-time `mj sync init` has nothing to overwrite.
        if (existsSync(path.join(process.cwd(), '.mj-sync.json'))) {
          const overwrite = await resolveOrPrompt<boolean>({
            flagValue: flags.overwrite,
            what: 'An overwrite decision (this directory is already initialized)',
            suggestion: 'Pass --overwrite to replace the existing configuration, or --no-overwrite to leave it alone.',
            prompt: () =>
              select({
                message: 'Directory already initialized. Overwrite configuration?',
                choices: [
                  { name: 'Yes', value: true },
                  { name: 'No', value: false },
                ],
              }),
          });

          if (!overwrite) {
            this.log('Initialization cancelled');
            return;
          }

          options.overwrite = true;
        }

        // Ask if they want to set up an entity directory
        const setupEntity = await resolveOrPrompt<string>({
          flagValue: flags['setup-entity'],
          what: 'An entity-directory choice',
          suggestion: 'Pass --setup-entity=ai-prompts|other|no.',
          prompt: () =>
            select({
              message: 'Would you like to set up an entity directory now?',
              choices: [
                { name: 'Yes - AI Prompts', value: 'ai-prompts' },
                { name: 'Yes - Other entity', value: 'other' },
                { name: "No - I'll set up later", value: 'no' },
              ],
            }),
        });

        options.setupEntity = setupEntity as 'ai-prompts' | 'other' | 'no';

        if (setupEntity === 'other') {
          options.entityName = await resolveOrPrompt<string>({
            flagValue: flags.entity,
            what: 'An entity name',
            suggestion: 'Pass --entity "MJ: AI Models".',
            prompt: () => input({ message: 'Enter the entity name (e.g., "Templates", "MJ: AI Models"):' }),
          });

          const defaultDir = options.entityName.toLowerCase().replace(/\s+/g, '-');
          options.dirName = await resolveOrPrompt<string>({
            // A directory name always has a sane default derived from the entity, so
            // headless runs fall back to it rather than failing.
            flagValue: flags.dir ?? (isInteractiveRun() ? undefined : defaultDir),
            what: 'A directory name',
            suggestion: `Pass --dir ${defaultDir}.`,
            prompt: () => input({ message: 'Enter the directory name:', default: defaultDir }),
          });
        }

        // Initialize with callbacks
        await initService.initialize(options, {
          onProgress: (message) => {
            spinner.start(message);
          },
          onSuccess: (message) => {
            spinner.succeed(message);
          },
          onError: (message) => {
            spinner.fail(message);
          },
        });

        this.log('\n✅ Initialization complete!');

        // Show next steps
        const nextSteps = initService.getNextSteps();
        this.log('\nNext steps:');
        nextSteps.forEach((step, index) => {
          this.log(`${index + 1}. ${step.replace('mj-sync', 'mj sync')}`);
        });
      } catch (error) {
        if (error instanceof NonInteractiveError) throw error;

        spinner.fail('Initialization failed');

        // Enhanced error logging
        this.log('\n=== Initialization Error Details ===');
        this.log(`Error type: ${error?.constructor?.name || 'Unknown'}`);
        this.log(`Error message: ${error instanceof Error ? error.message : String(error)}`);

        if (error instanceof Error && error.stack) {
          this.log(`\nStack trace:`);
          this.log(error.stack);
        }

        // Check for error hints
        if (error instanceof Error) {
          const hint = new InitService().getErrorHint(error);
          if (hint) {
            this.log(`\nHint: ${hint}`);
          }
        }

        this.error(error as Error);
      }
    });
  }
}
