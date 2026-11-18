import { Command, Flags } from '@oclif/core';
import { existsSync } from 'node:fs';
import { RequireMonorepoRoot, SpawnInherit } from '../../../lib/regression/docker-helpers.js';
import {
  BuildScaffold,
  IsRegressionPriority,
  ParseTestNumber,
  REGRESSION_PARITY_SCRIPT,
  REGRESSION_SUITE_FILE,
  WriteScaffold,
  type ScaffoldResult,
} from '../../../lib/regression/test-scaffold.js';

export default class TestRegressionNew extends Command {
  static description = 'Create a new MJ Explorer regression test and add it to the regression suite.';

  static examples = [
    `<%= config.bin %> <%= command.id %> --name "Form builder clones a form" --priority P1 --tags form-builder \\
  --start-path /app/form-builder --goal "Clone Contact Form and verify the copy opens in the editor." \\
  --criteria "A form named Copy of Contact Form is listed" --criteria "The form editor is open on the copy"`,
    '<%= config.bin %> <%= command.id %> --name "..." --goal "..." --criteria "..." --priority P2 --from T149 --dry-run',
  ];

  static flags = {
    name: Flags.string({ description: 'Test title, without the T### prefix. Must not contain "&".', required: true }),
    goal: Flags.string({ description: 'What the agent must achieve, stated as the success state.', required: true }),
    criteria: Flags.string({ description: 'A judge criterion (repeat the flag for more).', required: true, multiple: true }),
    priority: Flags.string({ description: 'Release priority.', required: true, options: ['P0', 'P1', 'P2', 'P3'] }),
    tags: Flags.string({ description: 'Comma-separated area tags, e.g. form-builder,crud.', default: '' }),
    'start-path': Flags.string({ description: 'Path after http://localhost:4200, e.g. /app/form-builder.', default: '' }),
    description: Flags.string({ description: 'Test description. Defaults to the goal.' }),
    'max-steps': Flags.integer({ description: 'Controller step limit.', default: 25, min: 1 }),
    from: Flags.string({ description: 'Copy Configuration from this test number, e.g. T149.' }),
    'dry-run': Flags.boolean({ description: 'Print the files without writing them.', default: false }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestRegressionNew);
    RequireMonorepoRoot();
    const priority = flags.priority;
    if (!IsRegressionPriority(priority)) this.error(`Unknown priority ${priority}.`);

    const repoRoot = process.cwd();
    let result: ScaffoldResult;
    try {
      result = BuildScaffold(repoRoot, {
        Title: flags.name,
        Goal: flags.goal,
        Criteria: flags.criteria,
        Priority: priority,
        Tags: flags.tags.split(','),
        StartPath: flags['start-path'],
        MaxSteps: flags['max-steps'],
        Description: flags.description,
        FromNumber: flags.from === undefined ? undefined : ParseTestNumber(flags.from),
      });
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }

    if (flags['dry-run']) {
      this.log(`# ${result.TestFilePath}\n${result.TestFileContent}`);
      this.log(`# ${REGRESSION_SUITE_FILE}: new member "${result.Name}" at Sequence ${result.Sequence}`);
      return;
    }

    await this.writeAndCheck(repoRoot, result);
    this.logNextSteps(result);
  }

  private async writeAndCheck(repoRoot: string, result: ScaffoldResult): Promise<void> {
    try {
      WriteScaffold(repoRoot, result);
    } catch (e) {
      this.error(e instanceof Error ? e.message : String(e));
    }
    this.log(`✓ Created ${result.Name}`);
    this.log(`  ${result.TestFilePath}`);
    this.log(`  Suite member added to ${REGRESSION_SUITE_FILE} at Sequence ${result.Sequence}`);

    if (existsSync(REGRESSION_PARITY_SCRIPT)) {
      const code = await SpawnInherit('node', [REGRESSION_PARITY_SCRIPT]);
      if (code !== 0) this.error('The regression suite parity check failed. Fix the problems listed above.');
    }
  }

  private logNextSteps(result: ScaffoldResult): void {
    const testNumber = result.Name.split(' ')[0];
    this.log('\nNext steps:');
    this.log('  1. Read the new file and sharpen the goal and criteria.');
    this.log('  2. Load it into your database: pnpm mj sync push --dir=metadata-optional/regression-test');
    this.log(`  3. Run it: pnpm mj test run --name "${result.Name}"`);
    this.log(`  If another PR takes ${testNumber} before yours merges, renumber this test after you rebase.`);
  }
}
