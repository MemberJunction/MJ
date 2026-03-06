#!/usr/bin/env ts-node
/**
 * Single Fixture Linter
 *
 * Lints a single component fixture and displays detailed violation results.
 *
 * Usage:
 *   npm run test:fixture <fixture-path>
 *
 * Examples:
 *   npm run test:fixture fixtures/valid-components/win-loss-analysis.json
 *   npm run test:fixture fixtures/broken-components/query-field-invalid.json
 *   npm run test:fixture ./fixtures/fixed-components/entity-field-correct.json
 */

import { ComponentLinter } from '@memberjunction/react-test-harness';
import { initializeDatabase, getContextUser, initializeComponentEngine, cleanupDatabase } from './infrastructure/database-setup';
import { loadFixture } from './fixtures/fixture-loader';
import type { UserInfo } from '@memberjunction/core';
import * as path from 'path';

async function main() {
  // Get fixture path from command line
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Error: No fixture path provided\n');
    console.log('Usage:');
    console.log('  npm run test:fixture <fixture-path>\n');
    console.log('Examples:');
    console.log('  npm run test:fixture fixtures/valid-components/win-loss-analysis.json');
    console.log('  npm run test:fixture fixtures/broken-components/query-field-invalid.json');
    console.log('  npm run test:fixture ./fixtures/fixed-components/entity-field-correct.json\n');
    process.exit(1);
  }

  const fixturePath = args[0];

  // Parse fixture path to determine category and name
  // Support both relative paths and full paths
  const normalized = path.normalize(fixturePath);
  const parts = normalized.split(path.sep);
  
  // Find 'fixtures' in the path
  const fixturesIndex = parts.indexOf('fixtures');
  if (fixturesIndex === -1 || fixturesIndex >= parts.length - 2) {
    console.error('❌ Error: Invalid fixture path format\n');
    console.log('Path must be in format: fixtures/<category>/<name>.json');
    console.log('Where category is one of: valid-components, broken-components, fixed-components\n');
    process.exit(1);
  }

  const categoryDir = parts[fixturesIndex + 1];
  const fileName = parts[parts.length - 1];
  const fixtureName = fileName.replace('.json', '');

  // Map directory name to category
  const categoryMap: Record<string, 'valid' | 'broken' | 'fixed'> = {
    'valid-components': 'valid',
    'broken-components': 'broken',
    'fixed-components': 'fixed'
  };

  const category = categoryMap[categoryDir];
  if (!category) {
    console.error(`❌ Error: Invalid category "${categoryDir}"\n`);
    console.log('Category must be one of: valid-components, broken-components, fixed-components\n');
    process.exit(1);
  }

  console.log('═'.repeat(80));
  console.log('Single Fixture Linter');
  console.log('═'.repeat(80));
  console.log(`Category: ${category}`);
  console.log(`Fixture:  ${fixtureName}`);
  console.log('═'.repeat(80));

  try {
    // Initialize MemberJunction
    console.log('\n🔄 Initializing MemberJunction...');
    await initializeDatabase();

    const contextUser: UserInfo = await getContextUser();
    await initializeComponentEngine(contextUser);

    // Load the fixture
    console.log(`\n📦 Loading fixture: ${fixtureName}...`);
    const fixture = await loadFixture(category, fixtureName);

    console.log(`   Component Name: ${fixture.spec.name}`);
    console.log(`   Type: ${fixture.spec.type}`);
    if (fixture.metadata.description) {
      console.log(`   Description: ${fixture.metadata.description.substring(0, 100)}${fixture.metadata.description.length > 100 ? '...' : ''}`);
    }

    // Run the linter
    console.log('\n🔍 Running linter...\n');
    let lintResult;
    try {
      lintResult = await ComponentLinter.lintComponent(
        fixture.spec.code,
        fixture.spec.name,
        fixture.spec,
        true,
        contextUser
      );
    } catch (error: unknown) {
      console.error('❌ FULL ERROR DETAILS:');
      console.error('Message:', (error as Error).message);
      console.error('Stack:', (error as Error).stack);
      throw error;
    }

    // Display results
    console.log('═'.repeat(80));
    console.log('LINT RESULTS');
    console.log('═'.repeat(80));
    console.log(`\nTotal violations: ${lintResult.violations.length}\n`);

    if (lintResult.violations.length === 0) {
      console.log('✅ No violations found - component passed all lint rules!\n');
    } else {
      // Group by rule
      const byRule = new Map<string, any[]>();
      lintResult.violations.forEach((v: any) => {
        if (!byRule.has(v.rule)) {
          byRule.set(v.rule, []);
        }
        byRule.get(v.rule)!.push(v);
      });

      console.log('Violations by rule:');
      const sortedRules = Array.from(byRule.entries()).sort((a, b) => b[1].length - a[1].length);
      sortedRules.forEach(([rule, violations]) => {
        console.log(`  ${rule}: ${violations.length}`);
      });

      // Show all violations with details
      console.log('\n' + '─'.repeat(80));
      console.log('ALL VIOLATIONS (detailed)');
      console.log('─'.repeat(80));

      lintResult.violations.forEach((v: any, idx: number) => {
        console.log(`\n${idx + 1}. Line ${v.line}, Column ${v.column}`);
        console.log(`   Rule: ${v.rule}`);
        console.log(`   Severity: ${v.severity}`);
        console.log(`   Message: ${v.message}`);
        
        if (v.suggestion) {
          console.log(`\n   Suggestion:`);
          console.log(`   ${v.suggestion.text}`);
          
          if (v.suggestion.example) {
            console.log(`\n   Example:`);
            const exampleLines = v.suggestion.example.split('\n');
            exampleLines.forEach((line: string) => {
              console.log(`   ${line}`);
            });
          }
        }
        
        if (idx < lintResult.violations.length - 1) {
          console.log('\n' + '─'.repeat(80));
        }
      });

      console.log('\n' + '─'.repeat(80));
    }

    // Show expected violations if this is a broken/fixed fixture
    if (fixture.metadata.expectedViolations && fixture.metadata.expectedViolations.length > 0) {
      console.log('\n' + '═'.repeat(80));
      console.log('EXPECTED VIOLATIONS');
      console.log('═'.repeat(80));
      console.log('\nThis fixture expects the following violations:');
      fixture.metadata.expectedViolations.forEach((rule: string) => {
        const found = lintResult.violations.some((v: any) => v.rule === rule);
        console.log(`  ${found ? '✅' : '❌'} ${rule}`);
      });

      // Check for unexpected violations
      const actualRules = new Set(lintResult.violations.map((v: any) => v.rule));
      const expectedRules = new Set(fixture.metadata.expectedViolations);
      const unexpected = Array.from(actualRules).filter(rule => !expectedRules.has(rule));
      
      if (unexpected.length > 0) {
        console.log('\n⚠️  Unexpected violations (not in expectedViolations):');
        unexpected.forEach(rule => {
          const count = lintResult.violations.filter((v: any) => v.rule === rule).length;
          console.log(`  ${rule}: ${count}`);
        });
      }
    }

    console.log('\n' + '═'.repeat(80) + '\n');

    await cleanupDatabase();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    await cleanupDatabase();
    process.exit(1);
  }
}

main();
