import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { SyncEngine } from '../lib/sync-engine';
import type { UserInfo } from '@memberjunction/core';

/**
 * Regression test for {@include} composition preserving the included file's
 * bytes verbatim. The composition used String.prototype.replace with the
 * included content as the *replacement string*, so the four string-search
 * special sequences ($$, $&, $`, $') in that content were interpreted as
 * replacement patterns and mangled instead of inserted literally.
 * (`$n` is NOT special when the search argument is a string — only these four.)
 */
describe('SyncEngine {@include} composition', () => {
  let tmpDir: string;
  let engine: SyncEngine;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mj-include-'));
    engine = new SyncEngine({} as UserInfo);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('preserves all four String.replace special $-sequences in included content', async () => {
    // All four string-search special patterns: $$ (→ $), $& (→ whole match),
    // $` (→ before-match text), $' (→ after-match text). All must survive verbatim.
    const snippet = "a $$ b $& c $` d $' e";
    await fs.writeFile(path.join(tmpDir, 'snippet.md'), snippet, 'utf-8');

    const mainPath = path.join(tmpDir, 'main.md');
    const content = 'BEFORE {@include ./snippet.md} AFTER';

    // processFileContentWithIncludes is private; exercised directly here because
    // the defect lives in its composition step, not in a caller. Bracket access
    // stays bound to the real signature (no cast, no hand-copied shape).
    const result = await engine['processFileContentWithIncludes'](content, mainPath);

    expect(result).toBe(`BEFORE ${snippet} AFTER`);
  });
});
