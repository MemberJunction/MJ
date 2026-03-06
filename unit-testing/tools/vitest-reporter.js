import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Custom Vitest reporter that outputs results to timestamped run directories
 */
export default class TimestampedJsonReporter {
  constructor(options = {}) {
    this.options = options;
    this.ctx = null;
  }

  onInit(ctx) {
    this.ctx = ctx;
  }

  async onFinished(files, errors) {
    if (!process.env.UNIT_TEST_RUN_DIR) {
      console.warn('⚠️  UNIT_TEST_RUN_DIR not set, skipping JSON output');
      return;
    }

    const runDir = process.env.UNIT_TEST_RUN_DIR;
    const packageName = this.options.packageName || this.detectPackageName();
    const packageDir = join(runDir, 'by-package', packageName);

    // Create package directory
    mkdirSync(packageDir, { recursive: true });

    // Collect results in Vitest format
    const results = {
      success: errors.length === 0,
      numTotalTests: 0,
      numPassedTests: 0,
      numFailedTests: 0,
      numPendingTests: 0,
      testResults: []
    };

    for (const file of files) {
      const tasks = file.tasks || [];
      const fileResult = {
        name: relative(process.cwd(), file.filepath),
        status: 'passed',
        startTime: file.result?.startTime || Date.now(),
        endTime: file.result?.duration ? (file.result.startTime + file.result.duration) : Date.now(),
        assertionResults: []
      };

      for (const task of tasks) {
        results.numTotalTests++;

        const assertion = {
          ancestorTitles: this.getAncestorTitles(task),
          fullName: this.getFullName(task),
          title: task.name,
          status: task.result?.state || 'pending',
          duration: task.result?.duration || 0
        };

        if (task.result?.state === 'pass') {
          results.numPassedTests++;
        } else if (task.result?.state === 'fail') {
          results.numFailedTests++;
          fileResult.status = 'failed';
          assertion.failureMessages = task.result?.errors?.map(e => e.message || String(e)) || [];
        } else {
          results.numPendingTests++;
        }

        fileResult.assertionResults.push(assertion);
      }

      results.testResults.push(fileResult);
    }

    // Write results.json
    const resultsFile = join(packageDir, 'results.json');
    writeFileSync(resultsFile, JSON.stringify(results, null, 2));

    console.log(`📊 Test results written to: ${resultsFile}`);
  }

  detectPackageName() {
    try {
      const pkg = JSON.parse(
        readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
      );
      return pkg.name || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  getAncestorTitles(task) {
    const titles = [];
    let current = task.suite;
    while (current) {
      if (current.name) titles.unshift(current.name);
      current = current.suite;
    }
    return titles;
  }

  getFullName(task) {
    const ancestors = this.getAncestorTitles(task);
    return [...ancestors, task.name].join(' > ');
  }
}
