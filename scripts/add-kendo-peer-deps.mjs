#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔍 Finding packages that use Kendo UI...\n');

// Find all package.json files in Angular packages
const files = await glob('packages/**/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

console.log(`Scanning ${files.length} package.json files...\n`);

let modified = 0;
let alreadyHave = 0;
let noKendo = 0;
let errors = 0;

for (const file of files) {
  try {
    const content = readFileSync(file, 'utf8');
    const pkg = JSON.parse(content);

    // Check if package uses any Kendo UI packages
    const hasKendo =
      (pkg.dependencies && Object.keys(pkg.dependencies).some(dep => dep.startsWith('@progress/kendo-angular'))) ||
      (pkg.peerDependencies && Object.keys(pkg.peerDependencies).some(dep => dep.startsWith('@progress/kendo-angular')));

    if (!hasKendo) {
      noKendo++;
      continue;
    }

    // Check if already has intl and icons
    const hasIntl =
      (pkg.dependencies && pkg.dependencies['@progress/kendo-angular-intl']) ||
      (pkg.peerDependencies && pkg.peerDependencies['@progress/kendo-angular-intl']);
    const hasIcons =
      (pkg.dependencies && pkg.dependencies['@progress/kendo-angular-icons']) ||
      (pkg.peerDependencies && pkg.peerDependencies['@progress/kendo-angular-icons']);

    if (hasIntl && hasIcons) {
      alreadyHave++;
      console.log(`-  Skipped: ${file} (already has intl and icons)`);
      continue;
    }

    let updated = false;

    // Add to dependencies or peerDependencies based on what exists
    if (pkg.dependencies && Object.keys(pkg.dependencies).some(dep => dep.startsWith('@progress/kendo-angular'))) {
      if (!pkg.dependencies['@progress/kendo-angular-intl']) {
        pkg.dependencies['@progress/kendo-angular-intl'] = '21.3.0';
        updated = true;
      }
      if (!pkg.dependencies['@progress/kendo-angular-icons']) {
        pkg.dependencies['@progress/kendo-angular-icons'] = '21.3.0';
        updated = true;
      }
    }

    if (pkg.peerDependencies && Object.keys(pkg.peerDependencies).some(dep => dep.startsWith('@progress/kendo-angular'))) {
      if (!pkg.peerDependencies['@progress/kendo-angular-intl']) {
        pkg.peerDependencies['@progress/kendo-angular-intl'] = '21.3.0';
        updated = true;
      }
      if (!pkg.peerDependencies['@progress/kendo-angular-icons']) {
        pkg.peerDependencies['@progress/kendo-angular-icons'] = '21.3.0';
        updated = true;
      }
    }

    if (updated) {
      // Write back with proper formatting
      writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      modified++;
      console.log(`✓  Updated: ${file}`);
    }
  } catch (error) {
    errors++;
    console.error(`✗  Error processing ${file}:`, error.message);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Summary:');
console.log(`   Modified: ${modified} files`);
console.log(`   Already had intl+icons: ${alreadyHave} files`);
console.log(`   No Kendo UI usage: ${noKendo} files`);
console.log(`   Errors: ${errors} files`);
console.log(`   Total scanned: ${files.length} files`);
console.log('='.repeat(80));

if (errors > 0) {
  process.exit(1);
}
