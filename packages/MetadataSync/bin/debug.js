#!/usr/bin/env node

// Debug wrapper for VS Code that properly handles arguments
const args = process.argv.slice(2).join(' ').split(' ').filter(arg => arg.length > 0);
process.argv = [process.argv[0], process.argv[1], ...args];

require('./run');