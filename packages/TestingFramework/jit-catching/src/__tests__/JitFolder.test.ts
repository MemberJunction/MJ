import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PurgeNonRegularEntries } from '../target/JitFolder';

describe('PurgeNonRegularEntries', () => {
  it('removes symlinks, FIFOs and folders from a jit folder and keeps regular files', () => {
    const jit = mkdtempSync(join(tmpdir(), 'jit-purge-'));
    const outside = join(mkdtempSync(join(tmpdir(), 'jit-out-')), 'secret'); writeFileSync(outside, 'SECRET');
    writeFileSync(join(jit, 'a.jit.test.ts'), 'x');
    symlinkSync(outside, join(jit, 'helper.ts'));
    mkdirSync(join(jit, 'sub'));
    const fifo = spawnSync('mkfifo', [join(jit, 'pipe.ts')]).status === 0;
    const removed = PurgeNonRegularEntries(jit).sort();
    expect(removed).toEqual(fifo ? ['helper.ts', 'pipe.ts', 'sub'] : ['helper.ts', 'sub']);
    expect(lstatSync(join(jit, 'helper.ts'), { throwIfNoEntry: false })).toBeUndefined();
    expect(existsSync(join(jit, 'a.jit.test.ts'))).toBe(true);
    expect(existsSync(outside)).toBe(true);
  });
});
