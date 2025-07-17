#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { ReactTestHarness } from '../lib/test-harness';

const program = new Command();

program
  .name('mj-react-test')
  .description('React component test harness for MemberJunction')
  .version('2.69.1');

program
  .command('run <componentFile>')
  .description('Run a React component test')
  .option('-p, --props <json>', 'Component props as JSON string')
  .option('-s, --selector <selector>', 'Wait for selector before capturing')
  .option('-t, --timeout <ms>', 'Timeout in milliseconds', '30000')
  .option('--headless', 'Run in headless mode (default)', true)
  .option('--headed', 'Run in headed mode (visible browser)')
  .option('--screenshot <path>', 'Save screenshot to path')
  .option('--debug', 'Enable debug output')
  .action(async (componentFile, options) => {
    const spinner = ora('Initializing test harness...').start();
    
    try {
      // Parse props if provided
      let props = {};
      if (options.props) {
        try {
          props = JSON.parse(options.props);
        } catch (error) {
          spinner.fail(chalk.red('Invalid JSON in props parameter'));
          process.exit(1);
        }
      }

      // Create test harness
      const harness = new ReactTestHarness({
        headless: !options.headed,
        debug: options.debug,
        screenshotPath: options.screenshot
      });

      spinner.text = 'Starting browser...';
      await harness.initialize();

      spinner.text = 'Loading component...';
      const result = await harness.testComponentFromFile(
        componentFile,
        props,
        {
          waitForSelector: options.selector,
          timeout: parseInt(options.timeout)
        }
      );

      spinner.stop();

      if (result.success) {
        console.log(chalk.green('✓ Component rendered successfully'));
        
        if (options.debug) {
          console.log('\n' + chalk.bold('Console Output:'));
          result.console.forEach((log: { type: string; text: string }) => {
            const color = log.type === 'error' ? chalk.red : 
                         log.type === 'warning' ? chalk.yellow : 
                         chalk.gray;
            console.log(color(`[${log.type}] ${log.text}`));
          });
        }

        if (options.screenshot && result.screenshot) {
          fs.writeFileSync(options.screenshot, result.screenshot);
          console.log(chalk.blue(`Screenshot saved to: ${options.screenshot}`));
        }
      } else {
        console.log(chalk.red('✗ Component rendering failed'));
        console.log(chalk.red('\nErrors:'));
        result.errors.forEach((error: string) => {
          console.log(chalk.red(`  - ${error}`));
        });
        process.exit(1);
      }

      await harness.close();
    } catch (error) {
      spinner.fail(chalk.red('Test execution failed'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('test <testFile>')
  .description('Run a test file with multiple test cases')
  .option('--headless', 'Run in headless mode (default)', true)
  .option('--headed', 'Run in headed mode (visible browser)')
  .option('--debug', 'Enable debug output')
  .action(async (testFile, options) => {
    const spinner = ora('Loading test file...').start();
    
    try {
      const testPath = path.resolve(testFile);
      
      if (!fs.existsSync(testPath)) {
        spinner.fail(chalk.red(`Test file not found: ${testPath}`));
        process.exit(1);
      }

      // Import the test file
      const testModule = await import(testPath);
      
      if (!testModule.default || typeof testModule.default !== 'function') {
        spinner.fail(chalk.red('Test file must export a default function'));
        process.exit(1);
      }

      spinner.text = 'Running tests...';
      
      // Create harness with options
      const harness = new ReactTestHarness({
        headless: !options.headed,
        debug: options.debug
      });

      // Run the test function - add AssertionHelpers to harness for test functions
      const harnessWithHelpers = Object.assign(harness, {
        AssertionHelpers: harness.getAssertionHelpers()
      });
      await testModule.default(harnessWithHelpers);
      
      spinner.succeed(chalk.green('All tests completed'));
      
      await harness.close();
    } catch (error) {
      spinner.fail(chalk.red('Test execution failed'));
      console.error(error);
      process.exit(1);
    }
  });

program
  .command('create-example')
  .description('Create an example component and test file')
  .option('-d, --dir <directory>', 'Directory to create files in', './react-test-example')
  .action(async (options) => {
    const dir = path.resolve(options.dir);
    
    console.log(chalk.blue(`Creating example files in: ${dir}`));
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Create example component
    const componentContent = `// Example React Component
const Component = ({ name, count, showDetails }) => {
  const [clickCount, setClickCount] = React.useState(0);

  const handleClick = () => {
    setClickCount(clickCount + 1);
  };

  return (
    <div className="example-component">
      <h1>Hello, {name || 'World'}!</h1>
      <p>Count: {count || 0}</p>
      <button onClick={handleClick}>
        Clicked {clickCount} times
      </button>
      {showDetails && (
        <div className="details">
          <p>This is additional detail content.</p>
        </div>
      )}
    </div>
  );
};`;

    fs.writeFileSync(path.join(dir, 'ExampleComponent.jsx'), componentContent);
    console.log(chalk.green('✓ Created ExampleComponent.jsx'));

    // Create example test
    const testContent = `// Example test using ReactTestHarness
export default async function runTests(harness) {
  const { AssertionHelpers } = harness;

  // Test 1: Basic rendering
  await harness.runTest('Component renders with default props', async () => {
    const result = await harness.testComponentFromFile(
      './ExampleComponent.jsx'
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Hello, World!');
    AssertionHelpers.assertContainsText(result.html, 'Count: 0');
  });

  // Test 2: Rendering with custom props
  await harness.runTest('Component renders with custom props', async () => {
    const result = await harness.testComponentFromFile(
      './ExampleComponent.jsx',
      { name: 'MemberJunction', count: 42, showDetails: true }
    );
    
    AssertionHelpers.assertSuccess(result);
    AssertionHelpers.assertContainsText(result.html, 'Hello, MemberJunction!');
    AssertionHelpers.assertContainsText(result.html, 'Count: 42');
    AssertionHelpers.assertHasElement(result.html, '.details');
  });

  // Test 3: Check for button element
  await harness.runTest('Component has clickable button', async () => {
    const result = await harness.testComponentFromFile(
      './ExampleComponent.jsx'
    );
    
    const matcher = harness.createMatcher(result.html);
    matcher.toHaveElement('button');
    matcher.toContainText('Clicked 0 times');
  });

  // Get test summary
  const summary = await harness.runTests([
    {
      name: 'No console errors',
      fn: async () => {
        const result = await harness.testComponentFromFile('./ExampleComponent.jsx');
        AssertionHelpers.assertNoConsoleErrors(result.console);
      }
    }
  ]);

  console.log(\`\\nTest Summary: \${summary.passed}/\${summary.total} passed\`);
}`;

    fs.writeFileSync(path.join(dir, 'example.test.js'), testContent);
    console.log(chalk.green('✓ Created example.test.js'));

    console.log(chalk.blue('\nTo run the example:'));
    console.log(chalk.gray(`  cd ${options.dir}`));
    console.log(chalk.gray('  mj-react-test run ExampleComponent.jsx'));
    console.log(chalk.gray('  mj-react-test run ExampleComponent.jsx --props \'{"name":"Test","count":10}\''));
    console.log(chalk.gray('  mj-react-test test example.test.js'));
  });

program.parse();