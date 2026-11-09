import { lstatSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Removes every entry of a jit folder that is not a regular file (by `lstat`): symlinks, FIFOs, sockets, devices and
 * folders. A sandboxed test can plant such entries in the read-write jit folder; the host later reads that folder.
 * Returns the names removed. A missing folder removes nothing.
 */
export function PurgeNonRegularEntries(jitDir: string): string[] {
    const st = lstatSync(jitDir, { throwIfNoEntry: false });
    if (!st?.isDirectory()) return [];
    const removed: string[] = [];
    for (const name of readdirSync(jitDir)) {
        const path = join(jitDir, name);
        const entry = lstatSync(path, { throwIfNoEntry: false });
        if (!entry || entry.isFile()) continue;
        if (entry.isDirectory()) rmSync(path, { recursive: true, force: true });
        else unlinkSync(path);
        removed.push(name);
    }
    return removed;
}
