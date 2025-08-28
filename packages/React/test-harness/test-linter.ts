#!/usr/bin/env ts-node
/**
 * Test script for validating linter rules on broken.json and broken-2.json
 */

import { ComponentLinter } from './src/lib/component-linter';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import * as fs from 'fs';
import * as path from 'path';

async function testLinter(specFile: string) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing: ${specFile}`);
  console.log('='.repeat(80));
  
  try {
    // Load the spec file
    const specPath = path.join(__dirname, specFile);
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const spec: ComponentSpec = JSON.parse(specContent);
    
    // Lint the component using static method
    const result = await ComponentLinter.lintComponent(
      spec.code || '', 
      spec.name,
      spec,
      true, // isRootComponent
      undefined, // contextUser
      false // debugMode
    );
    
    // Display results
    console.log(`\n✅ Lint completed: ${result.success ? 'PASSED' : 'FAILED'}`);
    console.log(`📊 Violation counts:`);
    console.log(`   - Critical: ${result.criticalCount || 0}`);
    console.log(`   - High: ${result.highCount || 0}`);
    console.log(`   - Medium: ${result.mediumCount || 0}`);
    console.log(`   - Low: ${result.lowCount || 0}`);
    
    // Show violations, especially our new rule
    console.log(`\n🔍 Violations:`);
    
    // Filter for our specific rules of interest
    const relevantRules = [
      'component-usage-without-destructuring',
      'undefined-component-usage', 
      'invalid-components-destructuring',
      'unused-component-dependencies'
    ];
    
    const relevantViolations = result.violations.filter((v: any) => 
      relevantRules.includes(v.rule)
    );
    
    if (relevantViolations.length > 0) {
      console.log('\n📌 Component access violations:');
      relevantViolations.forEach((v: any) => {
        console.log(`   [${v.severity.toUpperCase()}] ${v.rule} (line ${v.line})`);
        console.log(`   → ${v.message}`);
        if (v.code) {
          console.log(`   Code: ${v.code}`);
        }
        console.log();
      });
    }
    
    // Show other violations briefly
    const otherViolations = result.violations.filter((v: any) => 
      !relevantRules.includes(v.rule)
    );
    
    if (otherViolations.length > 0) {
      console.log('\n📋 Other violations (summary):');
      const violationCounts = new Map<string, number>();
      otherViolations.forEach((v: any) => {
        violationCounts.set(v.rule, (violationCounts.get(v.rule) || 0) + 1);
      });
      
      violationCounts.forEach((count, rule) => {
        console.log(`   - ${rule}: ${count} violation(s)`);
      });
    }
    
    // Check for specific component usage patterns
    if (spec.code) {
      console.log('\n🔎 Component usage patterns found:');
      
      // Check for destructuring
      const destructurePattern = /const\s*{\s*([^}]+)\s*}\s*=\s*components/g;
      const destructureMatches = spec.code.match(destructurePattern);
      if (destructureMatches) {
        console.log('   ✓ Component destructuring found');
      }
      
      // Check for direct usage without destructuring (our problematic case)
      const directUsagePattern = /<([A-Z][a-zA-Z]*)/g;
      const directUsages = spec.code.match(directUsagePattern);
      if (directUsages) {
        const componentNames = directUsages.map(m => m.substring(1));
        console.log(`   ⚠️ Direct component usage: ${componentNames.join(', ')}`);
      }
      
      // Check for components.X pattern
      const dotNotationPattern = /<components\.([A-Z][a-zA-Z]*)/g;
      const dotNotationMatches = spec.code.match(dotNotationPattern);
      if (dotNotationMatches) {
        console.log('   ✓ components.X notation found');
      }
    }
    
  } catch (error) {
    console.error(`❌ Error testing ${specFile}:`, error);
  }
}

// Run tests
async function runTests() {
  console.log('🧪 Linter Test Suite');
  console.log('Testing component access pattern rules');
  
  await testLinter('src/lib/broken.json');
  await testLinter('src/lib/broken-2.json');
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Test complete');
}

runTests().catch(console.error);