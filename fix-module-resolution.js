const fs = require('fs');

const files = fs.readFileSync('/tmp/angular-tsconfigs.txt', 'utf8').trim().split('\n');

let fixed = 0;
files.forEach(file => {
  try {
    const content = fs.readFileSync(file, 'utf8');
    const updated = content.replace(/"moduleResolution":\s*"bundler"/g, '"moduleResolution": "node"');
    if (content !== updated) {
      fs.writeFileSync(file, updated, 'utf8');
      console.log('Fixed:', file);
      fixed++;
    }
  } catch (err) {
    console.error('Error processing', file, err.message);
  }
});

console.log(`\nFixed ${fixed} files`);
