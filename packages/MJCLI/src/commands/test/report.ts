import { Command, Flags } from '@oclif/core';
import ora from 'ora-classic';
import fs from 'fs/promises';
import path from 'path';
import { getTestService } from '../../services/test';

export default class Report extends Command {
  static description = 'Generate test reports';

  static examples = [
    '<%= config.bin %> <%= command.id %> --type=eval --input=results.json',
    '<%= config.bin %> <%= command.id %> --type=eval --input=results.json --format=markdown --output=report.md',
  ];

  static flags = {
    type: Flags.string({
      description: 'Type of tests to report on',
      options: ['eval'],
      required: true,
    }),
    input: Flags.string({
      char: 'i',
      description: 'Input file with test results (JSON)',
      required: true,
    }),
    output: Flags.string({
      char: 'o',
      description: 'Output file for report',
    }),
    format: Flags.string({
      description: 'Output format',
      options: ['console', 'json', 'markdown'],
      default: 'console',
    }),
    dir: Flags.string({
      description: 'Directory containing eval definitions (for markdown format)',
      default: './evals',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Report);
    const spinner = ora();

    try {
      // Load results
      spinner.start('Loading test results...');
      const testService = getTestService();
      const results = await testService.loadResults(flags.input);
      spinner.succeed(`Loaded ${results.length} result(s)`);

      // Generate report
      const reporter = testService.getReporter();
      let report: string;

      if (flags.format === 'json') {
        report = reporter.formatAsJSON(results);
      } else if (flags.format === 'markdown') {
        // Load eval definitions for markdown format
        const evalDir = path.resolve(flags.dir);
        const evalDefs = new Map();

        for (const result of results) {
          const evalFiles = await testService.listEvals(evalDir, {});
          const evalInfo = evalFiles.find(e => e.eval_id === result.eval_id);
          if (evalInfo) {
            const evalDef = await testService.getEvalDefinition(evalInfo.file_path);
            evalDefs.set(result.eval_id, evalDef);
          }
        }

        report = reporter.formatAsMarkdown(results, evalDefs);
      } else {
        // Console format - show summary
        const passed = results.filter(r => r.status === 'pass').length;
        const failed = results.filter(r => r.status === 'fail').length;
        const errors = results.filter(r => r.status === 'error').length;

        report = `
Test Results Summary
====================

Total Tests: ${results.length}
Passed: ${passed}
Failed: ${failed}
Errors: ${errors}

Status: ${passed === results.length ? 'ALL PASSED ✓' : 'FAILURES DETECTED ✗'}
`;
      }

      // Output report
      if (flags.output) {
        spinner.start(`Saving report to ${flags.output}...`);
        await fs.writeFile(flags.output, report, 'utf-8');
        spinner.succeed(`Report saved to ${flags.output}`);
      } else {
        this.log(report);
      }

    } catch (error: any) {
      spinner.fail(error.message);
      this.error(error);
    }
  }
}
