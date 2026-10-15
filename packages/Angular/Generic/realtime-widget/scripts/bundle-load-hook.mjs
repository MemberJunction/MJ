/**
 * An ESM loader hook that appends every module URL Node loads to the file named by MJ_BUNDLE_LOAD_LOG.
 * `boot-bundle.mjs` uses it to prove WHICH of the widget's files were fetched at each step (the call chunk
 * only after start(), the Interactive Component chunk only when that channel is in scope).
 */
import { appendFileSync } from 'node:fs';

export async function load(url, context, nextLoad) {
    const log = process.env.MJ_BUNDLE_LOAD_LOG;
    if (log && url.startsWith('file:')) {
        appendFileSync(log, `${url}\n`);
    }
    return nextLoad(url, context);
}
