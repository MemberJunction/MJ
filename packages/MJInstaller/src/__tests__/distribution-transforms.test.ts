/**
 * Unit tests for the pure distribution transforms (port of CreateMJDistribution.js).
 * No filesystem or network — string in, string out.
 */
import { describe, it, expect } from 'vitest';
import {
  stripJsonComments,
  parseJsonc,
  deepMerge,
  flattenTsconfig,
  transformServerTsconfig,
  transformAngularTsconfig,
  stripTscAliasFromPackageJson,
  removePortFlagsFromPackageJson,
} from '../distribution/transforms.js';

describe('stripJsonComments', () => {
  it('removes line comments while preserving strings', () => {
    const input = '{\n  "a": 1, // trailing\n  "url": "http://x//y" // keep slashes in strings\n}';
    const out = JSON.parse(stripJsonComments(input)) as Record<string, unknown>;
    expect(out).toEqual({ a: 1, url: 'http://x//y' });
  });

  it('removes block comments', () => {
    const input = '{ /* block\n comment */ "a": 2 }';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ a: 2 });
  });

  it('does not strip // inside a quoted string', () => {
    const input = '{ "note": "a // b /* c */ d" }';
    expect(JSON.parse(stripJsonComments(input))).toEqual({ note: 'a // b /* c */ d' });
  });
});

describe('parseJsonc', () => {
  it('parses JSON containing comments', () => {
    expect(parseJsonc('{ "x": 1 /* c */ }')).toEqual({ x: 1 });
  });

  it('throws when the top-level value is not an object', () => {
    expect(() => parseJsonc('[1, 2, 3]')).toThrow();
  });
});

describe('deepMerge', () => {
  it('merges nested objects recursively', () => {
    const base = { compilerOptions: { target: 'es2022', strict: true } };
    const source = { compilerOptions: { strict: false, outDir: 'dist' } };
    expect(deepMerge(base, source)).toEqual({
      compilerOptions: { target: 'es2022', strict: false, outDir: 'dist' },
    });
  });

  it('replaces arrays rather than concatenating them', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });
});

describe('flattenTsconfig', () => {
  it('inlines the base config and drops the extends key', () => {
    const base = '{ "compilerOptions": { "target": "es2022", "strict": true } }';
    const pkg = '{ "extends": "../../tsconfig.server.json", "compilerOptions": { "outDir": "dist" }, "include": ["src/**/*"] }';
    const merged = flattenTsconfig(pkg, base);
    expect(merged.extends).toBeUndefined();
    expect(merged.compilerOptions).toEqual({ target: 'es2022', strict: true, outDir: 'dist' });
    expect(merged.include).toEqual(['src/**/*']);
  });
});

describe('transformServerTsconfig', () => {
  it('flattens and removes ../../node_modules excludes', () => {
    const base = '{ "compilerOptions": { "module": "es2022" } }';
    const pkg = '{ "extends": "../../tsconfig.server.json", "exclude": ["../../node_modules", "dist", "**/*.test.ts"] }';
    const out = JSON.parse(transformServerTsconfig(pkg, base)) as Record<string, unknown>;
    expect(out.extends).toBeUndefined();
    expect(out.exclude).toEqual(['dist', '**/*.test.ts']);
    expect(out.compilerOptions).toEqual({ module: 'es2022' });
  });
});

describe('transformAngularTsconfig', () => {
  it('flattens and removes the ng-bootstrap path alias', () => {
    const base = '{ "compilerOptions": { "target": "es2022" } }';
    const pkg = '{ "extends": "../../tsconfig.angular.json", "compilerOptions": { "paths": { "@memberjunction/ng-bootstrap": ["x"], "keep": ["y"] } } }';
    const out = JSON.parse(transformAngularTsconfig(pkg, base)) as { compilerOptions: { paths?: Record<string, unknown> } };
    expect(out.compilerOptions.paths).toEqual({ keep: ['y'] });
  });

  it('drops the paths object entirely when it becomes empty', () => {
    const base = '{ "compilerOptions": {} }';
    const pkg = '{ "extends": "../../tsconfig.angular.json", "compilerOptions": { "paths": { "@memberjunction/ng-bootstrap": ["x"] } } }';
    const out = JSON.parse(transformAngularTsconfig(pkg, base)) as { compilerOptions: { paths?: unknown } };
    expect(out.compilerOptions.paths).toBeUndefined();
  });
});

describe('stripTscAliasFromPackageJson', () => {
  it('removes "&& tsc-alias" from build scripts', () => {
    const input = JSON.stringify({ scripts: { build: 'tsc && tsc-alias -f', test: 'vitest run' } });
    const out = JSON.parse(stripTscAliasFromPackageJson(input)) as { scripts: Record<string, string> };
    expect(out.scripts.build).toBe('tsc');
    expect(out.scripts.test).toBe('vitest run');
  });

  it('leaves scripts without tsc-alias untouched', () => {
    const input = JSON.stringify({ scripts: { build: 'tsc' } });
    const out = JSON.parse(stripTscAliasFromPackageJson(input)) as { scripts: Record<string, string> };
    expect(out.scripts.build).toBe('tsc');
  });
});

describe('removePortFlagsFromPackageJson', () => {
  it('removes "--port NNNN" and "--port=NNNN" from scripts', () => {
    const input = JSON.stringify({ scripts: { start: 'ng serve --port 4201 --open', alt: 'ng serve --port=4201' } });
    const out = JSON.parse(removePortFlagsFromPackageJson(input)) as { scripts: Record<string, string> };
    expect(out.scripts.start).toBe('ng serve --open');
    expect(out.scripts.alt).toBe('ng serve');
  });
});
