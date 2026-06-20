/**
 * Deterministic gate: a connector PR may only touch the CANONICAL connector footprint.
 *
 * Why this is a hard gate (the agent-arc the connector build is supposed to follow):
 *   Building a connector is supposed to produce a SMALL, predictable set of changes — one connector class,
 *   one test, the shared index line, and the per-vendor metadata. Nothing else. The retired
 *   `connector-generator` / `connectors-registry` / `ConnectorSpec` machinery (ADR-001 — gone) is exactly
 *   the kind of stray surface a drifting build re-grows: a `connectors-registry/<vendor>/...` tree, a stray
 *   top-level `fixtures/...` dump, a doc file. This lint pins the build to the canonical footprint so a
 *   connector PR can't quietly sprawl back into the killed pattern (or into core).
 *
 * The ALLOWED footprint for a connector named `<X>` for vendor `<vendor>` is EXACTLY:
 *   - packages/Integration/connectors/src/<X>Connector.ts            (the connector class — any <X>)
 *   - packages/Integration/connectors/src/__tests__/<X>Connector.test.ts  (its mocked test — any <X>)
 *   - packages/Integration/connectors/src/index.ts                   (the shared registration index)
 *   - metadata/integrations/<vendor>/**                              (the per-vendor metadata tree)
 *
 * Anything else among the tracked, touched paths is a violation. Path prefixes are matched CASE-SENSITIVELY
 * (git paths are case-sensitive; a `Metadata/` or `Connectors-Registry/` is NOT the allowed dir).
 *
 * Pure: (vendor, trackedPaths[]) in → `{violations:[{path, why}]}` out. No I/O. Mirrors
 * fk-lookup-qualifier.mjs — the CLI at the bottom is the CI / floor-check gate.
 */

const WHY = 'outside canonical connector footprint';

const CONNECTORS_SRC = 'packages/Integration/connectors/src/';
const CONNECTORS_TESTS = 'packages/Integration/connectors/src/__tests__/';
const SHARED_INDEX = 'packages/Integration/connectors/src/index.ts';

/** Normalize a path to forward-slashes and strip a single leading `./` — does NOT lower-case (case-sensitive). */
function normPath(p) {
    if (typeof p !== 'string') return '';
    let s = p.replace(/\\/g, '/').trim();
    if (s.startsWith('./')) s = s.slice(2);
    return s;
}

/**
 * Is this normalized path inside the canonical connector footprint for `vendor`?
 *
 * @param {string} p       already-normalized path
 * @param {string} vendor  vendor slug (the `metadata/integrations/<vendor>/` segment)
 * @returns {boolean}
 */
function isInFootprint(p, vendor) {
    // The shared registration index — exact match.
    if (p === SHARED_INDEX) return true;

    // The per-vendor metadata tree: metadata/integrations/<vendor>/...  (something must follow the slash).
    const metaPrefix = `metadata/integrations/${vendor}/`;
    if (p.startsWith(metaPrefix) && p.length > metaPrefix.length) return true;

    // The connector test: packages/Integration/connectors/src/__tests__/<X>Connector.test.ts
    if (p.startsWith(CONNECTORS_TESTS)) {
        const rest = p.slice(CONNECTORS_TESTS.length);
        return /^[^/]+Connector\.test\.ts$/.test(rest);
    }

    // The connector class: packages/Integration/connectors/src/<X>Connector.ts
    // (checked AFTER __tests__ so a file under __tests__/ never matches this looser rule).
    if (p.startsWith(CONNECTORS_SRC)) {
        const rest = p.slice(CONNECTORS_SRC.length);
        return /^[^/]+Connector\.ts$/.test(rest);
    }

    return false;
}

/**
 * Lint a connector's touched, git-tracked paths against the canonical footprint.
 *
 * @param {string} vendor        vendor slug (matches the `metadata/integrations/<vendor>/` segment)
 * @param {string[]} trackedPaths git-tracked paths touched for this connector
 * @returns {{violations: Array<{path: string, why: string}>}}
 */
export function lintFootprint(vendor, trackedPaths) {
    const violations = [];
    if (typeof vendor !== 'string' || vendor.trim() === '') {
        return { violations: [{ path: '(vendor)', why: 'vendor must be a non-empty string' }] };
    }
    if (!Array.isArray(trackedPaths)) {
        return { violations: [{ path: '(trackedPaths)', why: 'trackedPaths must be an array of path strings' }] };
    }
    for (const raw of trackedPaths) {
        const p = normPath(raw);
        if (p === '') continue; // ignore blanks
        if (!isInFootprint(p, vendor)) {
            violations.push({ path: raw, why: WHY });
        }
    }
    return { violations };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Run only when invoked directly (not when imported by the test).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const isMain = (() => {
    try {
        return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
        return false;
    }
})();

if (isMain) {
    const args = process.argv.slice(2);
    const json = args.includes('--json');
    const positional = args.filter((a) => !a.startsWith('--'));

    // Input is a JSON `{vendor, trackedPaths}` — either inline as the positional arg, or a path to a file.
    let inputRaw = positional[0];
    if (inputRaw === undefined) {
        process.stderr.write('usage: node footprint-lint.mjs \'{"vendor":"acme","trackedPaths":[...]}\' [--json]\n       node footprint-lint.mjs <input.json> [--json]\n');
        process.exit(2);
    }

    let parsed;
    const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
    parsed = tryParse(inputRaw);
    if (parsed === undefined) {
        // Not inline JSON — treat it as a file path.
        try {
            parsed = JSON.parse(readFileSync(resolve(inputRaw), 'utf8'));
        } catch (e) {
            process.stderr.write(`could not parse argv as JSON or read it as a file: ${String(e && e.message ? e.message : e)}\n`);
            process.exit(2);
        }
    }

    const vendor = parsed && parsed.vendor;
    const trackedPaths = parsed && parsed.trackedPaths;
    const { violations } = lintFootprint(vendor, trackedPaths);

    if (json) {
        // Machine output for the floor-check consumer. Always exit 0 — the caller decides pass/fail.
        process.stdout.write(JSON.stringify({ vendor, violations, count: violations.length, clean: violations.length === 0 }));
        process.exit(0);
    }

    if (violations.length === 0) {
        process.stdout.write(`✓ footprint-lint: ${Array.isArray(trackedPaths) ? trackedPaths.length : 0} tracked path(s) all inside the canonical connector footprint for "${vendor}"\n`);
        process.exit(0);
    }
    process.stdout.write(`✗ footprint-lint: ${violations.length} path(s) ${WHY} (vendor "${vendor}"):\n`);
    for (const v of violations) {
        process.stdout.write(`    - ${v.path}\n        ${v.why}\n`);
    }
    process.exit(1);
}
