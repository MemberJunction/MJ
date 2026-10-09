/**
 * ng-realtime-media renders the `/media` models and nothing vendor-specific (plan #4761, hard rule 2). Its source
 * may import Angular, the shared UI components, the `/media` entry of the realtime client, `@memberjunction/ai`
 * (vendor-neutral Core types, such as the avatar reasons its wording is keyed by) and `rxjs` (a peer dependency; the
 * share-panel registry streams its panels). Anything else is refused: `livekit-client`, the router, and the client's
 * main entry, which carries the provider drivers.
 * Allowing a new import is a deliberate one-line change to {@link ALLOWED_IMPORTS}.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ALLOWED_IMPORTS: ReadonlySet<string> = new Set([
  '@angular/common',
  '@angular/core',
  '@angular/forms',
  '@memberjunction/ai',
  '@memberjunction/ai-realtime-client/media',
  '@memberjunction/ng-ui-components',
  'rxjs',
]);

/** Every non-test source file under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return name === '__tests__' ? [] : sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.test.ts') ? [path] : [];
  });
}

/** The module specifiers a source file imports or re-exports from. */
function importsOf(source: string): string[] {
  const pattern = /(?:\bfrom\s+|\bimport\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
  return [...source.matchAll(pattern)].map((match) => match[1]);
}

/** The imports of `source` the boundary refuses. */
function refused(source: string): string[] {
  return importsOf(source).filter((specifier) => !specifier.startsWith('.') && !ALLOWED_IMPORTS.has(specifier));
}

describe('ng-realtime-media import boundary', () => {
  it('imports only Angular, the shared UI components and the /media entry of the realtime client', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThanOrEqual(6);
    const violations = files.flatMap((file) => refused(readFileSync(file, 'utf8')).map((specifier) => `${relative(SRC, file)} imports ${specifier}`));
    expect(violations).toEqual([]);
  });

  it('refuses a vendor SDK, the router and the client main entry', () => {
    const source = [
      "import { Room } from 'livekit-client';",
      "import { Router } from '@angular/router';",
      "import { GeminiRealtimeClient } from '@memberjunction/ai-realtime-client';",
      "import type { MediaParticipant } from '@memberjunction/ai-realtime-client/media';",
      "export * from './lib/components/media-tile.component';",
    ].join('\n');
    expect(refused(source)).toEqual(['livekit-client', '@angular/router', '@memberjunction/ai-realtime-client']);
  });
});
