const fs = require('fs');
const path = require('path');

// Load the linter
const { ComponentLinter } = require('./dist/lib/component-linter.js');

async function testLinter() {
  // Load the broken component spec
  const specPath = path.join(__dirname, 'src/lib/broken-7.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

  console.log('Testing linter on component with module.exports...\n');

  // Run the linter (it returns a Promise)
  const result = await ComponentLinter.lintComponent(spec.code, spec.name, spec);

  console.log('Lint Result:');
  console.log('  Has Errors:', result.hasErrors);
  console.log('  Total Violations:', result.violations.length);

  // Check for export-related violations
  const exportViolations = result.violations.filter(v => 
    v.rule === 'no-export-statements' || 
    v.message.toLowerCase().includes('export') ||
    v.message.toLowerCase().includes('module.exports')
  );

  console.log('\nExport-related violations:', exportViolations.length);
  if (exportViolations.length > 0) {
    console.log('✅ Export violations found:');
    exportViolations.forEach(v => {
      console.log(`  - Rule: ${v.rule}`);
      console.log(`    Line: ${v.line}`);
      console.log(`    Message: ${v.message}`);
    });
  } else {
    console.log('❌ NO export violations found - module.exports was NOT caught!');
  }

  // Also check if module.exports appears in the code
  if (spec.code.includes('module.exports')) {
    console.log('\n⚠️  Code contains "module.exports" but linter did not catch it!');
  }

  // Show all violations to see what was caught
  console.log('\nAll violations:');
  result.violations.forEach(v => {
    console.log(`  - Rule: ${v.rule}, Line: ${v.line}, Severity: ${v.severity}`);
    if (v.message.length < 100) {
      console.log(`    Message: ${v.message}`);
    } else {
      console.log(`    Message: ${v.message.substring(0, 100)}...`);
    }
  });
}

testLinter().catch(console.error);