#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔍 Adding Angular packages to devDependencies for library compilation...\n');

const files = await glob('packages/Angular/**/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

const additionalFiles = await glob('packages/{MJExplorer,AngularElements/*}/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

const allFiles = [...files, ...additionalFiles];

console.log(`Scanning ${allFiles.length} package.json files...\n`);

let modified = 0;
let alreadyHave = 0;
let errors = 0;

// Packages needed for Angular library compilation
const requiredDevDeps = {
  '@angular/common': '21.0.6',
  '@angular/platform-browser': '21.0.6'
};

// Additional packages for libraries that use CDK
const cdkDevDeps = {
  '@angular/cdk': '21.0.5'
};

for (const file of allFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const pkg = JSON.parse(content);

    // Skip if no peerDependencies at all
    if (!pkg.peerDependencies) {
      continue;
    }

    // Check if this package has Angular in peerDependencies
    const hasAngularPeerDeps = Object.keys(pkg.peerDependencies).some(dep =>
      dep.startsWith('@angular/')
    );

    if (!hasAngularPeerDeps) {
      continue;
    }

    // Initialize devDependencies if it doesn't exist
    if (!pkg.devDependencies) {
      pkg.devDependencies = {};
    }

    let needsUpdate = false;
    const added = [];

    // Add required Angular dev dependencies if not present
    for (const [dep, version] of Object.entries(requiredDevDeps)) {
      if (!pkg.devDependencies[dep]) {
        pkg.devDependencies[dep] = version;
        needsUpdate = true;
        added.push(dep);
      }
    }

    // Check if package uses CDK (has it in dependencies or peerDependencies)
    const usesCdk =
      (pkg.dependencies && Object.keys(pkg.dependencies).some(d => d === '@angular/cdk')) ||
      (pkg.peerDependencies && Object.keys(pkg.peerDependencies).some(d => d === '@angular/cdk'));

    if (usesCdk) {
      for (const [dep, version] of Object.entries(cdkDevDeps)) {
        if (!pkg.devDependencies[dep]) {
          pkg.devDependencies[dep] = version;
          needsUpdate = true;
          added.push(dep);
        }
      }
    }

    if (!needsUpdate) {
      alreadyHave++;
      continue;
    }

    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    modified++;
    console.log(`✓  Updated: ${file}`);
    console.log(`   Added: ${added.join(', ')}`);

  } catch (error) {
    errors++;
    console.error(`✗  Error processing ${file}:`, error.message);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Summary:');
console.log(`   Modified: ${modified} files`);
console.log(`   Already have required deps: ${alreadyHave} files`);
console.log(`   Errors: ${errors} files`);
console.log(`   Total scanned: ${allFiles.length} files`);
console.log('='.repeat(80));

if (errors > 0) {
  process.exit(1);
}
