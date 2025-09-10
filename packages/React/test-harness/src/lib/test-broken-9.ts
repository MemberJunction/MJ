#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { ComponentSpec } from '@memberjunction/interactive-component-types';
import { ComponentLinter } from './component-linter';

async function testBroken9() {
  try {
    // Load the broken-9.json spec
    const specPath = path.join(__dirname, 'broken-9.json');
    const specContent = fs.readFileSync(specPath, 'utf-8');
    const spec: ComponentSpec = JSON.parse(specContent);
    
    console.log('=== Testing broken-9.json Component ===\n');
    console.log(`Component: ${spec.name} (${spec.title})\n`);
    
    // Test the root component
    if (spec.code) {
      console.log('Testing root component code...');
      // Remove libraries from spec temporarily to avoid contextUser requirement
      const specWithoutLibraries = { ...spec, libraries: undefined };
      let result;
      try {
        result = await ComponentLinter.lintComponent(
          spec.code,
          spec.name,
          specWithoutLibraries,
          true, // isRootComponent
          undefined, // no contextUser for now
          false // no debug mode
        );
      } catch (error) {
        console.error('Linter threw error:', error);
        throw error;
      }
      
      console.log(`Has Errors: ${result.hasErrors}`);
      console.log(`Total Violations: ${result.violations.length}`);
      
      // Debug: Show all violations
      console.log('All violation rules:', result.violations.map(v => v.rule));
      
      // Show parse error details
      const parseError = result.violations.find(v => v.rule === 'parse-error');
      if (parseError) {
        console.log('\nParse Error Details:');
        console.log(parseError.message);
      }
      
      // Filter for callbacks and sorting violations
      const importantViolations = result.violations.filter(v => 
        v.rule === 'callbacks-usage-validation' || 
        v.rule === 'callbacks-passthrough-only' ||
        v.rule === 'table-sorting-implementation'
      );
      
      if (importantViolations.length > 0) {
        console.log('\n=== IMPORTANT VIOLATIONS FOUND ===');
        importantViolations.forEach((v, i) => {
          console.log(`\n${i + 1}. [${v.severity.toUpperCase()}] ${v.rule}`);
          console.log(`   Line ${v.line}, Column ${v.column}`);
          console.log(`   Message: ${v.message}`);
          if (v.suggestion) {
            console.log(`   Suggestion: ${v.suggestion.text}`);
            if (v.suggestion.example) {
              console.log(`   Example:\n${v.suggestion.example.split('\n').map(l => '     ' + l).join('\n')}`);
            }
          }
        });
      }
    }
    
    // Test child components
    if (spec.dependencies && spec.dependencies.length > 0) {
      console.log('\n\n=== Testing Child Components ===\n');
      
      for (const dep of spec.dependencies) {
        if (dep.code) {
          console.log(`\nTesting ${dep.name}:`);
          // Remove libraries from spec temporarily to avoid contextUser requirement
          const depSpecWithoutLibraries = { ...dep, libraries: undefined } as ComponentSpec;
          const result = await ComponentLinter.lintComponent(
            dep.code,
            dep.name,
            depSpecWithoutLibraries,
            false, // not root component
            undefined, // no contextUser
            false // no debug mode
          );
          
          console.log(`  Has Errors: ${result.hasErrors}`);
          console.log(`  Total Violations: ${result.violations.length}`);
          
          // Find the specific issue with callbacks
          const callbacksIssues = result.violations.filter(v => 
            v.rule === 'callbacks-usage-validation' || 
            v.rule === 'callbacks-passthrough-only' ||
            v.rule === 'component-props-validation'
          );
          
          if (callbacksIssues.length > 0) {
            console.log('\n  Relevant violations:');
            callbacksIssues.forEach((v, i) => {
              console.log(`  ${i + 1}. [${v.severity.toUpperCase()}] ${v.rule}`);
              console.log(`     Line ${v.line}, Column ${v.column}`);
              console.log(`     Message: ${v.message}`);
              if (v.suggestion) {
                console.log(`     Suggestion: ${v.suggestion.text}`);
              }
            });
          }
        }
      }
    }
    
  } catch (error) {
    console.error('Error testing component:', error);
    process.exit(1);
  }
}

testBroken9().catch(console.error);