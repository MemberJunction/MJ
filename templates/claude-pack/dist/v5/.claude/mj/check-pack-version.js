#!/usr/bin/env node
/**
 * SessionStart hook — checks whether a newer MJ Claude Code pack is
 * available upstream and prints a one-line notice if so.
 *
 * Wired in `.claude/settings.json`:
 *
 *   "hooks": {
 *     "SessionStart": [
 *       { "matcher": "*", "hooks": [
 *           { "type": "command", "command": "node .claude/mj/check-pack-version.js" }
 *       ] }
 *     ]
 *   }
 *
 * Guarantees (so this can never break a session):
 *  - Always exits 0. Errors are swallowed.
 *  - All output goes to stderr — stdout stays clean for the hook host.
 *  - Network: at most one HTTPS GET per 7 days per project, gated by the
 *    mtime of `.claude/mj/.last-check`.
 *  - Zero npm dependencies. Pure node stdlib: fs, path, https.
 *  - 5-second connect/read timeout — won't stall session start on a flaky link.
 *
 * The MJ major is derived at runtime from `.claude/mj/VERSION`, so this same
 * helper works for v5, v6, … without a rebuild.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_TIMEOUT_MS = 5000;
const HERE = __dirname; // .claude/mj/

function main() {
    // Two escape hatches for air-gapped environments and tests:
    //   MJ_PACK_CHECK_DISABLE=1  — skip the check entirely
    //   MJ_PACK_CHECK_URL=<url>  — fetch from this URL instead of GitHub
    if (process.env.MJ_PACK_CHECK_DISABLE === '1') return;

    const versionPath = path.join(HERE, 'VERSION');
    const cachePath = path.join(HERE, '.last-check');

    // Read local pack version. No VERSION → no pack installed yet → nothing to check.
    let localVersion;
    try {
        localVersion = fs.readFileSync(versionPath, 'utf8').trim();
    } catch {
        return;
    }
    if (!localVersion) return;

    // Skip if we've checked within the last 7 days.
    try {
        const stat = fs.statSync(cachePath);
        if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) return;
    } catch {
        // No cache yet — proceed
    }

    // Touch the cache BEFORE fetching so a hung/failed fetch doesn't cause
    // every session start to retry. Best-effort cache; ignore write errors.
    try {
        fs.writeFileSync(cachePath, '');
    } catch {
        // continue anyway
    }

    const major = localVersion.split('.')[0];
    if (!/^\d+$/.test(major)) return;

    const url =
        process.env.MJ_PACK_CHECK_URL ||
        'https://raw.githubusercontent.com/MemberJunction/MJ/main/' +
            'templates/claude-pack/dist/v' + major + '/.claude/mj/VERSION';

    fetchText(url, FETCH_TIMEOUT_MS)
        .then(function (remote) {
            if (!remote) return;
            const remoteVersion = remote.trim();
            if (compareSemver(remoteVersion, localVersion) > 0) {
                process.stderr.write(
                    'MJ Claude pack update available: v' +
                        localVersion +
                        ' → v' +
                        remoteVersion +
                        '. Run `mj update:claude` to upgrade.\n'
                );
            }
        })
        .catch(function () {
            // Silent — staleness check is best-effort.
        });
}

function fetchText(url, timeoutMs) {
    // http:// support is for tests and air-gapped self-hosted mirrors.
    const mod = url.startsWith('https://') ? https : http;
    return new Promise(function (resolve, reject) {
        const req = mod.get(url, function (res) {
            if (res.statusCode !== 200) {
                res.resume();
                resolve(null);
                return;
            }
            let body = '';
            res.setEncoding('utf8');
            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                resolve(body);
            });
            res.on('error', reject);
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, function () {
            req.destroy(new Error('timeout'));
        });
    });
}

function compareSemver(a, b) {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        const x = Number.isFinite(pa[i]) ? pa[i] : 0;
        const y = Number.isFinite(pb[i]) ? pb[i] : 0;
        if (x !== y) return x - y;
    }
    return 0;
}

try {
    main();
} catch {
    // Never block. Never fail. Never surprise the user.
}
