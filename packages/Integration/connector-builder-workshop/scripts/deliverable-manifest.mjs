/**
 * Deterministic deliverable manifest + clean-stage partition + canonical-format guard.
 *
 * Why this exists (the "human trims the PR by hand" failure):
 *   A build run touches FAR more than the connector: it regenerates the entity tree, rewrites mj.config,
 *   bumps the lockfile, drops 13 fixtures (4 used), rsyncs tooling into the worktree, and (the worst one) a
 *   stray `JSON.stringify` MINIFIES the 9.88 MB metadata file. Left alone, all of that churn lands in the PR
 *   and a human has to trim it back to the real deliverable. This module makes the deliverable EXPLICIT and
 *   partitions a `git status` into {stage exactly these} vs {never stage these — with the reason}, plus a
 *   guard that the metadata file is canonical (indent=2), never minified.
 *
 * Pure: paths + status lines in, partition out. No git calls (the caller runs `git status --porcelain` and
 * feeds the lines). The CLI wires the two together.
 */

/**
 * The canonical relative paths of a connector build's deliverables.
 * @param {{ vendorSlug: string, className: string }} p
 */
export function deliverablePaths({ vendorSlug, className }) {
    return {
        connector: `packages/Integration/connectors/src/${className}.ts`,
        test: `packages/Integration/connectors/src/__tests__/${className}.test.ts`,
        index: `packages/Integration/connectors/src/index.ts`,
        metadata: `metadata/integrations/${vendorSlug}/.${vendorSlug}.integration.json`,
        metadataDir: `metadata/integrations/${vendorSlug}/`,
        credentialTypes: `metadata/credential-types/.credential-types.json`,
        credentialSchemasDir: `metadata/credential-types/schemas/`,
        changesetDir: `.changeset/`,
        // engine/framework changes are legitimate but must be human-reviewed, not auto-staged blindly
        engineSrcPrefix: `packages/Integration/engine/src/`,
        connectorsSrcPrefix: `packages/Integration/connectors/src/`,
    };
}

/** Churn that must NEVER be staged in a connector PR, with the reason for each. Ordered most-specific first. */
const EXCLUDE_RULES = [
    { test: (p) => /(^|\/)generated\//.test(p) || /\.generated\.(ts|js)$/.test(p), reason: 'generated-tree' },
    { test: (p) => /(entity_subclasses|generated|mj-class-registrations|generated-forms\.module|class-registrations-manifest)\.ts$/.test(p), reason: 'generated-tree' },
    { test: (p) => /(^|\/)mj\.config\.cjs$/.test(p) || /(^|\/)\.env(\.|$)/.test(p) || /(^|\/)\.vscode\//.test(p), reason: 'local-config' },
    { test: (p) => /(^|\/)package-lock\.json$/.test(p), reason: 'lockfile' },
    { test: (p) => /connector-builder-workshop\//.test(p) || /connectors-registry\//.test(p), reason: 'tooling' },
    { test: (p) => /(^|\/)\.backups\//.test(p) || /(^|\/)runs\//.test(p) || /\.bak$/.test(p), reason: 'backup-or-run-artifact' },
    { test: (p) => /(^|\/)plans\//.test(p) || /(^|\/)agentic-local\//.test(p), reason: 'local-plan' },
];

/** Parse one `git status --porcelain` line into `{ status, path }` (handles renames `A  a -> b`). */
export function parseStatusLine(line) {
    const s = String(line);
    const status = s.slice(0, 2).trim();
    let path = s.slice(3).trim();
    const arrow = path.indexOf(' -> ');
    if (arrow >= 0) path = path.slice(arrow + 4).trim();
    return { status, path };
}

/**
 * Partition changed files into {stage, exclude, review}.
 *  - stage   : a known deliverable → stage it.
 *  - exclude : matches a churn rule → never stage (carries the reason).
 *  - review  : an unrecognized source change (e.g. engine src) → surface for a human decision, don't auto-stage.
 * @param {string[]} statusLines `git status --porcelain` lines
 * @param {ReturnType<typeof deliverablePaths>} d
 */
export function partitionStatus(statusLines, d) {
    const stage = [];
    const exclude = [];
    const review = [];
    const isDeliverable = (p) =>
        p === d.connector || p === d.test || p === d.index || p === d.credentialTypes ||
        p.startsWith(d.metadataDir) || p.startsWith(d.credentialSchemasDir) || p.startsWith(d.changesetDir);
    for (const line of statusLines) {
        if (!line || !line.trim()) continue;
        const { status, path } = parseStatusLine(line);
        const churn = EXCLUDE_RULES.find((r) => r.test(path));
        if (churn) {
            exclude.push({ path, status, reason: churn.reason });
            continue;
        }
        if (isDeliverable(path)) {
            stage.push({ path, status });
            continue;
        }
        // Unrecognized: a non-generated source change (often a real framework edit like an auth-helper field).
        // Don't silently stage it, don't silently drop it — surface for human review.
        review.push({ path, status, note: path.startsWith(d.engineSrcPrefix) || path.startsWith(d.connectorsSrcPrefix) ? 'framework-src-change' : 'unrecognized' });
    }
    return { stage, exclude, review };
}

/**
 * Canonical-format guard: a metadata JSON file must be indent=2, never minified (the 9.88 MB one-liner bug).
 * @param {string} text raw file contents
 * @returns {{ ok: boolean, reason: string }}
 */
export function assertCanonicalMetadata(text) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (e) {
        return { ok: false, reason: `invalid JSON: ${String(e && e.message ? e.message : e)}` };
    }
    const canonical = JSON.stringify(parsed, null, 2);
    const canonicalIsMultiline = canonical.includes('\n');
    const textIsSingleLine = !text.trim().includes('\n');
    if (canonicalIsMultiline && textIsSingleLine) {
        return { ok: false, reason: 'minified — non-trivial JSON written on a single line (expected indent=2)' };
    }
    return { ok: true, reason: 'canonical indent=2' };
}

// ── CLI ───────────────────────────────────────────────────────────────────────────────────────────
// Usage:
//   node deliverable-manifest.mjs partition --vendor <slug> --class <ClassName> [--json]   (reads git status --porcelain on stdin)
//   node deliverable-manifest.mjs check-format <metadata.json> [--json]
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const cmd = args[0];
    const json = args.includes('--json');
    const argVal = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);

    if (cmd === 'check-format') {
        const { readFileSync } = await import('node:fs');
        const file = args.find((a, i) => i >= 1 && !a.startsWith('--'));
        const text = readFileSync(file, 'utf8');
        const v = assertCanonicalMetadata(text);
        if (json) { process.stdout.write(JSON.stringify({ file, ...v })); process.exit(0); }
        process.stdout.write(`${v.ok ? '✓' : '✗'} canonical-format ${file}: ${v.reason}\n`);
        process.exit(v.ok ? 0 : 1);
    }

    if (cmd === 'partition') {
        const d = deliverablePaths({ vendorSlug: argVal('--vendor') ?? '', className: argVal('--class') ?? '' });
        const stdin = await new Promise((resolve) => {
            let raw = '';
            process.stdin.on('data', (c) => (raw += c));
            process.stdin.on('end', () => resolve(raw));
            if (process.stdin.isTTY) resolve('');
        });
        const part = partitionStatus(stdin.split('\n'), d);
        if (json) { process.stdout.write(JSON.stringify(part)); process.exit(0); }
        process.stdout.write(`Deliverables to stage (${part.stage.length}):\n`);
        for (const s of part.stage) process.stdout.write(`    + ${s.path}\n`);
        process.stdout.write(`Excluded churn (${part.exclude.length}):\n`);
        for (const e of part.exclude) process.stdout.write(`    - ${e.path}  [${e.reason}]\n`);
        if (part.review.length) {
            process.stdout.write(`Needs human review (${part.review.length}):\n`);
            for (const r of part.review) process.stdout.write(`    ? ${r.path}  [${r.note}]\n`);
        }
        process.exit(0);
    }

    process.stderr.write('usage: deliverable-manifest.mjs <partition|check-format> ...\n');
    process.exit(2);
}
