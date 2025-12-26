#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { glob } from 'glob';

console.log('🔍 Updating Angular peerDependencies in library packages...\n');

const files = await glob('packages/Angular/**/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

// Also check MJExplorer and AngularElements
const additionalFiles = await glob('packages/{MJExplorer,AngularElements/*}/package.json', {
  ignore: ['**/node_modules/**', '**/dist/**']
});

const allFiles = [...files, ...additionalFiles];

console.log(`Scanning ${allFiles.length} package.json files...\n`);

let modified = 0;
let alreadyCorrect = 0;
let noAngularPeerDeps = 0;
let errors = 0;

const angularVersion = '21.0.6';

for (const file of allFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    const pkg = JSON.parse(content);

    if (!pkg.peerDependencies) {
      noAngularPeerDeps++;
      continue;
    }

    const angularPeerDeps = Object.keys(pkg.peerDependencies).filter(dep =>
      dep.startsWith('@angular/')
    );

    if (angularPeerDeps.length === 0) {
      noAngularPeerDeps++;
      continue;
    }

    let needsUpdate = false;
    const oldVersions = new Set();

    for (const dep of angularPeerDeps) {
      const currentVersion = pkg.peerDependencies[dep];
      if (currentVersion !== angularVersion) {
        oldVersions.add(currentVersion);
        needsUpdate = true;
      }
    }

    if (!needsUpdate) {
      alreadyCorrect++;
      console.log(`✓  Already correct: ${file}`);
      continue;
    }

    // Update all Angular peerDependencies
    for (const dep of angularPeerDeps) {
      pkg.peerDependencies[dep] = angularVersion;
    }

    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    modified++;
    console.log(`✓  Updated: ${file} (from ${[...oldVersions].join(', ')} to ${angularVersion})`);

  } catch (error) {
    errors++;
    console.error(`✗  Error processing ${file}:`, error.message);
  }
}

console.log('\n' + '='.repeat(80));
console.log('📊 Summary:');
console.log(`   Modified: ${modified} files`);
console.log(`   Already correct: ${alreadyCorrect} files`);
console.log(`   No Angular peerDependencies: ${noAngularPeerDeps} files`);
console.log(`   Errors: ${errors} files`);
console.log(`   Total scanned: ${allFiles.length} files`);
console.log('='.repeat(80));

if (errors > 0) {
  process.exit(1);
}
