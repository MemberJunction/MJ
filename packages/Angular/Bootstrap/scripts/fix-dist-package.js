#!/usr/bin/env node
/**
 * Post-build script to fix dist/package.json for npm publishing
 *
 * Problem: ng-packagr copies source package.json fields into dist/package.json,
 * including "main" and "types" with "./dist/" prefixes, which are wrong when
 * publishing from the dist directory.
 *
 * Solution: Remove problematic fields from dist/package.json. The ng-packagr
 * generated fields (module, typings, exports) are sufficient and have correct paths.
 */

const fs = require('fs');
const path = require('path');

const distPackageJsonPath = path.join(__dirname, '..', 'dist', 'package.json');

console.log('Fixing dist/package.json for npm publish...');

// Read dist/package.json
const packageJson = JSON.parse(fs.readFileSync(distPackageJsonPath, 'utf8'));

// Remove fields that have incorrect paths for publishing from dist
delete packageJson.main;        // ng-packagr's "module" and "exports" are sufficient
delete packageJson.types;       // ng-packagr's "typings" and "exports.types" are sufficient
delete packageJson.files;       // Not needed when publishing from dist
delete packageJson.publishConfig; // Not needed in dist/package.json
delete packageJson.scripts;     // Already removed by ng-packagr
delete packageJson.devDependencies; // Already removed by ng-packagr

// Override sideEffects: ng-packagr sets false by default, but this package
// contains a class registration manifest that relies on bare imports for side
// effects (@RegisterClass decorators). Without sideEffects: true, bundlers
// like ESBuild will ignore `import '@memberjunction/ng-bootstrap'`.
packageJson.sideEffects = true;

// Write back
fs.writeFileSync(distPackageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

console.log('✓ Fixed dist/package.json for npm publish');
console.log('  - Removed "main" (using "module" and "exports" instead)');
console.log('  - Removed "types" (using "typings" and "exports.types" instead)');
console.log('  - Removed "files" (publishing entire dist directory)');
console.log('  - Removed "publishConfig" (not needed in dist)');
console.log('  - Set "sideEffects": true (class registration manifest requires bare import)');
