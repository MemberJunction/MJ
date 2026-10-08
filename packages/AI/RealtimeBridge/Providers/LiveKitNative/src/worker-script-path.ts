/**
 * @fileoverview Where this package's worker entries are found at run time. Internal: not exported from the package index.
 *
 * @module @memberjunction/ai-bridge-livekit-native
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The path of one of this package's built worker entries (`media-worker-bootstrap.js`, `video-encode-worker.js`): beside
 * this module in `dist/`, or in `../dist/` when this module runs from `src/` (vitest, dev). When neither exists, the path
 * beside this module, so the caller's own check or `new Worker` reports it.
 */
export function ResolveWorkerScriptPath(fileName: string): string {
    const besideThis = fileURLToPath(new URL(`./${fileName}`, import.meta.url));
    if (existsSync(besideThis)) {
        return besideThis;
    }
    const distPath = path.resolve(path.dirname(besideThis), '../dist', fileName);
    if (existsSync(distPath)) {
        return distPath;
    }
    return besideThis;
}
