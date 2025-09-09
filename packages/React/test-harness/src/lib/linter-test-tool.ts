import { ComponentLinter } from './component-linter';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

export interface LinterTestResult {
  component: string;
  path: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  subComponents?: LinterTestResult[];
}

export class LinterTestTool {
  private linter: ComponentLinter;

  constructor() {
    this.linter = new ComponentLinter();
  }

  /**
   * Test a single component spec file
   */
  public async testComponentSpec(specPath: string, contextUser?: any): Promise<LinterTestResult> {
    try {
      // Read the spec file
      const specContent = fs.readFileSync(specPath, 'utf-8');
      const spec = JSON.parse(specContent);
      
      // Get the code file path
      const codePath = this.resolveCodePath(specPath, spec.code);
      if (!codePath || !fs.existsSync(codePath)) {
        return {
          component: spec.name || 'Unknown',
          path: specPath,
          passed: false,
          errors: [`Code file not found: ${spec.code}`],
          warnings: []
        };
      }

      // Read the code file
      const code = fs.readFileSync(codePath, 'utf-8');
      
      // Run the linter
      const result = await ComponentLinter.lintComponent(
        code,
        spec.name,
        spec,
        true, // isRootComponent
        contextUser,
        false // debugMode
      );

      // Process sub-components if they have dependencies
      const subComponents: LinterTestResult[] = [];
      if (spec.dependencies && Array.isArray(spec.dependencies)) {
        for (const dep of spec.dependencies) {
          if (dep.startsWith('@include:')) {
            const subSpecName = dep.replace('@include:', '');
            const subSpecPath = path.join(path.dirname(specPath), subSpecName);
            if (fs.existsSync(subSpecPath)) {
              const subResult = await this.testSubComponentSpec(subSpecPath, contextUser);
              subComponents.push(subResult);
            }
          }
        }
      }

      return {
        component: spec.name,
        path: specPath,
        passed: result.success && result.violations.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0,
        errors: result.violations.filter(v => v.severity === 'critical' || v.severity === 'high').map(v => `${v.rule}: ${v.message} (line ${v.line})`),
        warnings: result.violations.filter(v => v.severity === 'medium' || v.severity === 'low').map(v => `${v.rule}: ${v.message} (line ${v.line})`),
        subComponents: subComponents.length > 0 ? subComponents : undefined
      };
    } catch (error) {
      return {
        component: 'Unknown',
        path: specPath,
        passed: false,
        errors: [`Failed to test component: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Test a sub-component spec file
   */
  private async testSubComponentSpec(specPath: string, contextUser?: any): Promise<LinterTestResult> {
    try {
      const specContent = fs.readFileSync(specPath, 'utf-8');
      const spec = JSON.parse(specContent);
      
      const codePath = this.resolveCodePath(specPath, spec.code);
      if (!codePath || !fs.existsSync(codePath)) {
        return {
          component: spec.name || 'Unknown',
          path: specPath,
          passed: false,
          errors: [`Code file not found: ${spec.code}`],
          warnings: []
        };
      }

      const code = fs.readFileSync(codePath, 'utf-8');
      
      const result = await ComponentLinter.lintComponent(
        code,
        spec.name,
        spec,
        false, // isRootComponent - sub-components are not root
        contextUser,
        false
      );

      return {
        component: spec.name,
        path: specPath,
        passed: result.success && result.violations.filter(v => v.severity === 'critical' || v.severity === 'high').length === 0,
        errors: result.violations.filter(v => v.severity === 'critical' || v.severity === 'high').map(v => `${v.rule}: ${v.message} (line ${v.line})`),
        warnings: result.violations.filter(v => v.severity === 'medium' || v.severity === 'low').map(v => `${v.rule}: ${v.message} (line ${v.line})`)
      };
    } catch (error) {
      return {
        component: 'Unknown',
        path: specPath,
        passed: false,
        errors: [`Failed to test sub-component: ${error instanceof Error ? error.message : String(error)}`],
        warnings: []
      };
    }
  }

  /**
   * Test all component specs in a directory
   */
  public async testDirectory(dirPath: string, contextUser?: any): Promise<LinterTestResult[]> {
    const pattern = path.join(dirPath, '**/spec/*.spec.json');
    const files = await glob(pattern);
    
    const results: LinterTestResult[] = [];
    
    for (const file of files) {
      // Skip sub-component specs (they'll be tested as part of their parent)
      const fileName = path.basename(file);
      if (!fileName.includes('-')) {
        const result = await this.testComponentSpec(file, contextUser);
        results.push(result);
      }
    }
    
    return results;
  }

  /**
   * Test specific component by name
   */
  public async testComponentByName(componentName: string, baseDir: string, contextUser?: any): Promise<LinterTestResult | null> {
    // Convert component name to file name format (kebab-case)
    const fileName = componentName
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '') + '.spec.json';
    
    const pattern = path.join(baseDir, '**/spec', fileName);
    const files = await glob(pattern);
    
    if (files.length === 0) {
      console.error(`Component spec not found: ${componentName}`);
      return null;
    }
    
    return this.testComponentSpec(files[0], contextUser);
  }

  /**
   * Resolve code file path from spec reference
   */
  private resolveCodePath(specPath: string, codeRef: string): string | null {
    if (!codeRef) return null;
    
    if (codeRef.startsWith('@file:')) {
      const relativePath = codeRef.replace('@file:', '');
      return path.join(path.dirname(specPath), relativePath);
    }
    
    // Handle other code reference formats if needed
    return null;
  }

  /**
   * Format test results for display
   */
  public formatResults(results: LinterTestResult | LinterTestResult[]): string {
    const resultArray = Array.isArray(results) ? results : [results];
    let output = '';
    
    for (const result of resultArray) {
      output += this.formatSingleResult(result, 0);
    }
    
    // Summary
    const total = resultArray.length;
    const passed = resultArray.filter(r => r.passed).length;
    const failed = total - passed;
    
    output += '\n' + '='.repeat(60) + '\n';
    output += `SUMMARY: ${passed}/${total} components passed`;
    if (failed > 0) {
      output += ` (${failed} failed)`;
    }
    output += '\n';
    
    return output;
  }

  private formatSingleResult(result: LinterTestResult, indent: number = 0): string {
    const prefix = '  '.repeat(indent);
    let output = '';
    
    const status = result.passed ? '✓' : '✗';
    const color = result.passed ? '\x1b[32m' : '\x1b[31m'; // Green or Red
    const reset = '\x1b[0m';
    
    output += `${prefix}${color}${status}${reset} ${result.component}\n`;
    
    if (result.errors.length > 0) {
      output += `${prefix}  Errors:\n`;
      for (const error of result.errors) {
        output += `${prefix}    - ${error}\n`;
      }
    }
    
    if (result.warnings.length > 0) {
      output += `${prefix}  Warnings:\n`;
      for (const warning of result.warnings) {
        output += `${prefix}    - ${warning}\n`;
      }
    }
    
    if (result.subComponents) {
      output += `${prefix}  Sub-components:\n`;
      for (const sub of result.subComponents) {
        output += this.formatSingleResult(sub, indent + 2);
      }
    }
    
    return output;
  }

  /**
   * Save test results to file
   */
  public saveResults(results: LinterTestResult | LinterTestResult[], outputPath: string): void {
    const data = {
      timestamp: new Date().toISOString(),
      results: Array.isArray(results) ? results : [results]
    };
    
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
  }
}

// CLI interface if run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  ts-node linter-test-tool.ts <spec-file-path>');
    console.log('  ts-node linter-test-tool.ts --dir <directory-path>');
    console.log('  ts-node linter-test-tool.ts --component <component-name> --base <base-dir>');
    process.exit(1);
  }
  
  const tool = new LinterTestTool();
  
  async function run() {
    let results: LinterTestResult | LinterTestResult[] | null = null;
    
    if (args[0] === '--dir' && args[1]) {
      results = await tool.testDirectory(args[1]);
    } else if (args[0] === '--component' && args[1] && args[2] === '--base' && args[3]) {
      results = await tool.testComponentByName(args[1], args[3]);
    } else if (args[0] && !args[0].startsWith('--')) {
      results = await tool.testComponentSpec(args[0]);
    }
    
    if (results) {
      console.log(tool.formatResults(results));
      
      // Save results if --save flag is provided
      const saveIndex = args.indexOf('--save');
      if (saveIndex !== -1 && args[saveIndex + 1]) {
        tool.saveResults(results, args[saveIndex + 1]);
        console.log(`Results saved to: ${args[saveIndex + 1]}`);
      }
    }
  }
  
  run().catch(console.error);
}