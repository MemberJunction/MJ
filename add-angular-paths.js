const fs = require('fs');
const path = require('path');

const angularPaths = {
  "@angular/common/http": ["../../../../node_modules/@angular/common/types/http.d.ts"],
  "@angular/common/http/testing": ["../../../../node_modules/@angular/common/types/http-testing.d.ts"],
  "@angular/platform-browser/animations": ["../../../../node_modules/@angular/platform-browser/types/animations.d.ts"],
  "@angular/cdk/drag-drop": ["../../../../node_modules/@angular/cdk/types/drag-drop.d.ts"],
  "@angular/cdk/overlay": ["../../../../node_modules/@angular/cdk/types/overlay.d.ts"],
  "@angular/cdk/portal": ["../../../../node_modules/@angular/cdk/types/portal.d.ts"],
  "@angular/core/primitives/di": ["../../../../node_modules/@angular/core/types/primitives-di.d.ts"],
  "@angular/animations/browser": ["../../../../node_modules/@angular/animations/types/browser.d.ts"]
};

const files = fs.readFileSync('/tmp/angular-tsconfigs.txt', 'utf8').trim().split('\n');

let count = 0;
files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const config = JSON.parse(content);

    // Add or merge paths
    if (!config.compilerOptions.paths) {
      config.compilerOptions.paths = {};
    }

    Object.assign(config.compilerOptions.paths, angularPaths);

    // Write back with proper formatting
    const updatedContent = JSON.stringify(config, null, 2) + '\n';
    fs.writeFileSync(file, updatedContent, 'utf8');
    console.log('Updated:', file);
    count++;
  } catch (err) {
    console.error('Error processing', file, err.message);
  }
});

console.log(`\nUpdated ${count} files with Angular path mappings`);
