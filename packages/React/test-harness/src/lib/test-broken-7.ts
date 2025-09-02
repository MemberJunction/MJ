import { ComponentLinter } from './component-linter';
import * as fs from 'fs';
import * as path from 'path';

async function testBroken7() {
  // Read the spec file
  const specPath = path.join(__dirname, 'broken-7.json');
  const specContent = fs.readFileSync(specPath, 'utf-8');
  const spec = JSON.parse(specContent);

  console.log('\n=== Testing Root Component (ModelExplorer) ===\n');
  
  // Test the root component
  const rootResult = await ComponentLinter.lintComponent(
    spec.code,
    spec.name,
    spec,
    true,  // isRootComponent
    undefined,  // contextUser
    true  // debugMode
  );

  console.log('Root Component Lint Results:');
  console.log('Has Errors:', rootResult.hasErrors);
  console.log('Violations:', rootResult.violations.length);
  
  rootResult.violations.forEach((v, i) => {
    console.log(`\n${i + 1}. [${v.severity.toUpperCase()}] ${v.rule}`);
    console.log(`   Line ${v.line}, Column ${v.column}`);
    console.log(`   Message: ${v.message}`);
    if (v.code) {
      console.log(`   Code: ${v.code}`);
    }
    if (v.suggestion) {
      console.log(`   Suggestion: ${v.suggestion.text}`);
      if (v.suggestion.example) {
        console.log(`   Example:\n${v.suggestion.example}`);
      }
    }
  });

  // Now test the child components
  console.log('\n\n=== Testing Child Components ===\n');
  
  for (const dep of spec.dependencies) {
    if (dep.code) {
      console.log(`\nTesting ${dep.name}:`);
      const childResult = await ComponentLinter.lintComponent(
        dep.code,
        dep.name,
        dep,
        false,  // not root component
        undefined,
        true
      );
      
      console.log(`  Has Errors: ${childResult.hasErrors}`);
      console.log(`  Violations: ${childResult.violations.length}`);
      
      childResult.violations.forEach((v, i) => {
        console.log(`  ${i + 1}. [${v.severity.toUpperCase()}] ${v.rule}: ${v.message}`);
      });
    }
  }
}

testBroken7().catch(console.error);