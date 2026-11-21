import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Babel7 = require('babel7');                      // the Babel line MJ's web host loads today (7.24.4)
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
console.log('Babel', Babel7.version, '| typescript preset available:', 'typescript' in Babel7.availablePresets);

const tsx = fs.readFileSync('widget.good.tsx', 'utf8');
const t0 = performance.now();
// Same call the runtime makes today, plus ONE extra preset. No type-check here: types are just deleted.
const js = Babel7.transform(tsx, { filename: 'component.tsx', presets: [['typescript', { isTSX: true, allExtensions: true }], 'react'] }).code;
console.log(`stripped in ${Math.round(performance.now() - t0)} ms; ${tsx.length} chars TSX -> ${js.length} chars JS; any type syntax left: ${/: MyOpenTasksProps|<Row_Tasks\[\]>/.test(js)}`);
console.log('--- first lines of emitted JS ---\n' + js.split('\n').slice(0, 4).join('\n'));

// Run it through the same factory shape react-runtime uses (component-compiler.ts:773): React + hooks injected.
const factory = new Function('React', 'useState', 'useEffect', 'useMemo', 'useCallback', 'useRef', `${js}; return MyOpenTasks;`);
const Component = factory(React, React.useState, React.useEffect, React.useMemo, React.useCallback, React.useRef);
const StatTile = ({ label, value, tone }) => React.createElement('b', { 'data-tone': tone }, `${label}: ${value}`);
const html = renderToStaticMarkup(React.createElement(Component, {
  utilities: { rv: { RunView: async () => ({ Success: true, Results: [] }) } },
  styles: { spacing: { md: '12px' }, colors: { textSecondary: '#555' } }, components: { StatTile }, callbacks: {},
}));
console.log('--- rendered on React', React.version, '---\n' + html);
