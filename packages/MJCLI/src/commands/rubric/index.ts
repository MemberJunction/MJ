import { Command } from '@oclif/core';

export default class RubricIndex extends Command {
  static description = 'List, show, diff, validate, and evaluate rubrics.';

  async run(): Promise<void> {
    this.log('Rubric commands:');
    this.log('  mj rubric list');
    this.log('  mj rubric show <rubric>[@version]');
    this.log('  mj rubric diff <rubric> <version> <version>');
    this.log('  mj rubric validate <file>');
    this.log('  mj rubric evaluate --rubric <rubric> --entity <name> --record <id>');
  }
}
