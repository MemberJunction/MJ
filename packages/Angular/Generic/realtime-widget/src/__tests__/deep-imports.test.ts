import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The widget reaches into ng-conversations by DEEP IMPORT so the heavy `ConversationsModule` barrel (whose
 * NgModule metadata names Explorer's whole component library) never lands in the one-script bundle. That
 * path is version-coupled to ng-conversations' dist layout (the package publishes no `exports` map), so this
 * spec fails loudly the moment a path moves, and when a barrel import creeps into widget source.
 */
const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, '..');
const conversationsDist = resolve(here, '../../../conversations/dist');
const BARREL = /from\s+['"]@memberjunction\/ng-conversations['"]/;
const DEEP = /from\s+['"]@memberjunction\/ng-conversations\/dist\/([^'"]+)['"]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === '__tests__' ? [] : sourceFiles(full);
    }
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

describe('ng-conversations deep imports', () => {
  const files = sourceFiles(srcDir);

  it('never imports the ng-conversations barrel from widget source', () => {
    const offenders = files.filter((f) => BARREL.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('finds the deep-import paths it relies on in the built ng-conversations (build ng-conversations first)', () => {
    const wanted = new Set<string>();
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(DEEP)) {
        wanted.add(match[1]);
      }
    }
    expect(wanted.size).toBeGreaterThanOrEqual(3);
    const missing = [...wanted].filter((p) => !existsSync(join(conversationsDist, `${p}.js`)));
    expect(missing).toEqual([]);
  });

  it('relies on the overlay, the runtime service and the identity channel by name', () => {
    const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    for (const path of [
      'lib/components/realtime/realtime-session-overlay.component',
      'lib/services/realtime-session.service',
      'lib/components/realtime/identity-verification/identity-verification-channel'
    ]) {
      expect(all).toContain(`@memberjunction/ng-conversations/dist/${path}`);
    }
  });
});
