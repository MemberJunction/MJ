#!/usr/bin/env node
import('../dist/cli.js').then((m) => { m.InstallWarningFilter(); return m.Main(process.argv.slice(2)); }).then((code) => process.exit(code));
