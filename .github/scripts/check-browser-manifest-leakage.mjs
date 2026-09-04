#!/usr/bin/env node
/**
 * Browser class-registration manifest server-leakage gate.
 *
 * `packages/Angular/Bootstrap` and `packages/Angular/BootstrapLite` ship the pre-built
 * `@RegisterClass` manifests that get bundled straight into the browser. Everything reachable
 * from their dependency trees ends up in the Angular bundle. When a SERVER-only package lands
 * in one, esbuild fails on the Node built-ins it drags in — `Could not resolve "crypto"` /
 * `"stream"` / `"console"` — and the MJExplorer dev server never binds (no
 * `Local: http://localhost:4201/`).
 *
 * ## The incident this exists to prevent (June 2026)
 *
 * A single transitive edge — `ng-bootstrap` → `@memberjunction/templates` →
 * `aiengine` + `ai-provider-bundle` — flooded the browser manifest with 27 server packages.
 * `templates` looks like a harmless utility and imports **no Node built-ins of its own**; its
 * entire danger is transitive. That is the single most important fact about this gate, and the
 * reason the denylist below is CURATED BY HAND rather than derived from a source scan for
 * `node:*` imports: such a scan would not flag `templates`, `aiengine`, or `ai-provider-bundle`
 * — i.e. it would miss every package that actually caused the incident.
 *
 * It also ratchets. The generator (`CodeGenLib/src/.../GenerateClassRegistrationsManifest.ts`)
 * runs a `syncDependencies` reconciliation pass that AUTO-WRITES every package it discovered
 * back into the target's `package.json` as a direct dependency. So one bad transitive edge is
 * not a one-time slip — it pins the whole server cluster in place for the next regeneration.
 *
 * And it hides. A warm dev server keeps serving the previous bundle; only a COLD rebuild fails.
 * That is what turns this from a nuisance into a gate: the developer who introduces it usually
 * cannot see it, and CI or a colleague's machine hits it days later.
 *
 * This gate replaces the hand-rolled `grep -nE ...` that `packages/Angular/Bootstrap/CLAUDE.md`
 * previously asked contributors to run by hand. That grep had drifted from the prose rule
 * beside it — it omitted `@memberjunction/server`, `ai-agents`, `ai-prompts`,
 * `communication-engine`, and `content-autotagging`, all of which the same document forbids.
 *
 * ## Why an explicit file allowlist and not a glob
 *
 * The sibling freshness gate in `test.yml` globs `'*mj-class-registrations.ts'`, which resolves
 * to 12 files — most of them SERVER manifests. `packages/ServerBootstrap/src/generated/`
 * legitimately imports 109 packages including `server`, `storage`, `templates`, `ai-agents` and
 * `ai-openai`. Reusing that glob would red this gate on day one. Only browser artifacts are
 * listed in GUARDED, and a missing one is a hard misconfiguration (exit 2) so that renaming a
 * file cannot silently switch the gate off.
 *
 * ## Why specifiers are parsed, never grepped
 *
 * The manifest BODIES are full of identifiers that collide with forbidden package names:
 * `MJTemplateEntity`, `MJTemplateParamEntity`, `MJFileStorageProviderEntity`,
 * `MJMCPServerEntity`, `CommunicationTemplatesResourceComponent`. A whole-file grep for
 * "templates" or "storage" matches all of them. This reads only module specifiers, normalizes
 * each to `@scope/name` (subpath stripped), and tests EXACT set membership — so
 * `@memberjunction/ng-file-storage` (allowed, and present today) is never confused with
 * `@memberjunction/storage`, nor `templates-base-types` with `templates`, nor
 * `ai-engine-base` with `aiengine`.
 *
 * ## Scope — what green does NOT mean
 *
 * Green means the committed browser manifests import no denylisted package. It does not mean
 * the dependency graph is clean: a package that contributes no `@RegisterClass` class emits no
 * import line and is invisible here, even though reconciliation may still have written it into
 * `package.json`. The bounded direct-dependency check below closes that hole for the two
 * bootstrap manifests without walking a 107-node graph.
 *
 * On PR-filtered CI runs the manifests are not regenerated, so a PR can introduce a poisoned
 * edge while leaving a stale-but-clean manifest untouched. That is why `test.yml` runs this
 * gate a SECOND time on the full-suite path, after the build has regenerated the manifests and
 * before the freshness gate reports the same problem as an opaque diff.
 *
 * Usage:  node .github/scripts/check-browser-manifest-leakage.mjs [--json]
 * Exit:   0 = clean, 1 = server package leaked, 2 = misconfiguration (missing file / denylist drift).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Committed BROWSER artifacts. Explicit, never a glob — see the doc block.
 * `packages/MJExplorer/src/app/generated/class-registrations-manifest.ts` is deliberately absent:
 * it is a gitignored local host artifact (.gitignore), not repository content.
 */
const GUARDED = [
    'packages/Angular/Bootstrap/src/generated/mj-class-registrations.ts',
    'packages/Angular/BootstrapLite/src/generated/mj-class-registrations.ts',
    'packages/Angular/BootstrapLite/src/mj-class-registrations.ts',
    'packages/Angular/Explorer/explorer-core/src/generated/lazy-feature-config.ts',
];

/** Browser packages whose own `dependencies` / `peerDependencies` must also stay clean. */
const GUARDED_MANIFESTS = [
    'packages/Angular/Bootstrap/package.json',
    'packages/Angular/BootstrapLite/package.json',
];

/** The AI provider bundle — every member is server-only, and the list must stay in sync. */
const BUNDLE_PACKAGE_JSON = 'packages/AI/Providers/Bundle/package.json';

/**
 * Tier 1 — named verbatim as forbidden by `packages/Angular/Bootstrap/CLAUDE.md` and
 * `packages/Angular/BootstrapLite/CLAUDE.md`. Each has a browser-safe counterpart where one
 * is needed: aiengine → ai-engine-base, ai-vectors-pinecone → ai-vectors-memory,
 * templates → templates-base-types.
 */
const TIER_1 = [
    '@memberjunction/aiengine',
    '@memberjunction/ai-provider-bundle',
    '@memberjunction/ai-vectors-pinecone',
    '@memberjunction/storage',
    '@memberjunction/templates',
    '@memberjunction/server',
    '@memberjunction/ai-agents',
    '@memberjunction/ai-prompts',
    '@memberjunction/communication-engine',
    '@memberjunction/content-autotagging',
];

/**
 * Tier 2 — the members of `@memberjunction/ai-provider-bundle`, enumerated rather than globbed.
 * A glob on `ai-*` would also match the browser-SAFE `ai-core-plus`, `ai-engine-base`,
 * `ai-realtime-client` and `ai-vectors-memory`, all of which are present in the manifests today.
 * `assertBundleCoverage()` below fails the run if the bundle gains a member this list lacks.
 */
const TIER_2 = [
    '@memberjunction/ai-anthropic', '@memberjunction/ai-assemblyai', '@memberjunction/ai-azure',
    '@memberjunction/ai-bedrock', '@memberjunction/ai-betty-bot', '@memberjunction/ai-blackforestlabs',
    '@memberjunction/ai-cerebras', '@memberjunction/ai-cohere', '@memberjunction/ai-elevenlabs',
    '@memberjunction/ai-fireworks', '@memberjunction/ai-gemini', '@memberjunction/ai-groq',
    '@memberjunction/ai-heygen', '@memberjunction/ai-inception', '@memberjunction/ai-inworld',
    '@memberjunction/ai-llamacpp', '@memberjunction/ai-lmstudio', '@memberjunction/ai-local-embeddings',
    '@memberjunction/ai-minimax', '@memberjunction/ai-mistral', '@memberjunction/ai-ollama',
    '@memberjunction/ai-openai', '@memberjunction/ai-openrouter', '@memberjunction/ai-recommendations-rex',
    '@memberjunction/ai-vertex', '@memberjunction/ai-xai', '@memberjunction/ai-zhipu',
];

/**
 * NEVER add to the denylist — these are browser-safe and present in the manifests today:
 * core, core-entities, global, graphql-dataprovider, actions-base, ai-core-plus, ai-engine-base,
 * ai-realtime-client, ai-vectors-memory, communication-types, entity-communications-base,
 * tag-engine-base, templates-base-types, and every `@memberjunction/ng-*` package.
 *
 * Deliberately NOT included: packages that are server-only by Node-built-in evidence but that
 * neither CLAUDE.md forbids (e.g. `core-actions`, `queue`, `codegen-lib`, `metadata-sync`).
 * They are absent from the manifests today, so denying them would cost nothing now — and block
 * a legitimate future browser feature later, on no documented authority. Add one here only when
 * the owning CLAUDE.md says it is forbidden.
 */
const DENY = new Set([...TIER_1, ...TIER_2]);

/**
 * Matches the three shapes a specifier can take in these generated files:
 * `} from '...'`, `import('...')` (lazy-feature-config), and a bare side-effect `import '...'`.
 * The `m` flag is required by the bare-import alternative's `^`.
 */
const SPEC_RE = /\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^[ \t]*import\s+['"]([^'"]+)['"]/gm;

/** Normalizes a module specifier to its package name: `@scope/pkg/sub/path` -> `@scope/pkg`. */
export function packageNameOf(spec) {
    if (!spec || spec.startsWith('.') || spec.startsWith('/')) {
        return null; // relative / absolute — not a package
    }
    const parts = spec.split('/');
    if (spec.startsWith('@')) {
        return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    }
    return parts[0];
}

/** Extracts `{ spec, line }` for every module specifier in a source file. */
export function extractSpecifiers(text) {
    const found = [];
    for (const m of text.matchAll(SPEC_RE)) {
        const spec = m[1] ?? m[2] ?? m[3];
        if (!spec) {
            continue;
        }
        found.push({ spec, line: text.slice(0, m.index).split('\n').length });
    }
    return found;
}

/** Scans one file's specifiers against the denylist. */
export function scanSource(text, file, deny = DENY) {
    return extractSpecifiers(text)
        .map(({ spec, line }) => ({ file, line, spec, pkg: packageNameOf(spec) }))
        .filter((hit) => hit.pkg !== null && deny.has(hit.pkg));
}

/** Scans one package.json's runtime dependency declarations against the denylist. */
export function scanManifest(json, file, deny = DENY) {
    const declared = [
        ...Object.keys(json.dependencies ?? {}),
        ...Object.keys(json.peerDependencies ?? {}),
    ];
    return declared
        .filter((pkg) => deny.has(pkg))
        .map((pkg) => ({ file, line: null, spec: pkg, pkg }));
}

/**
 * Denylist drift guard. The bundle is the one part of the list that can grow without anyone
 * touching this file, so a new provider that is not denied here is a real hole — reported as a
 * misconfiguration, not a pass.
 */
function assertBundleCoverage(root, deny) {
    const path = join(root, BUNDLE_PACKAGE_JSON);
    if (!existsSync(path)) {
        return [`Cannot verify denylist coverage: ${BUNDLE_PACKAGE_JSON} not found.`];
    }
    const json = JSON.parse(readFileSync(path, 'utf8'));
    const members = Object.keys(json.dependencies ?? {}).filter((d) => d.startsWith('@memberjunction/'));
    const missing = members.filter((m) => !deny.has(m));
    if (missing.length === 0) {
        return [];
    }
    return [
        `${BUNDLE_PACKAGE_JSON} declares ${missing.length} package(s) absent from this gate's denylist: ${missing.join(', ')}.`,
        `Add them to TIER_2 in ${'.github/scripts/check-browser-manifest-leakage.mjs'} — every member of the provider bundle is server-only.`,
    ];
}

function main(argv = process.argv.slice(2)) {
    const asJson = argv.includes('--json');
    const problems = [];
    const violations = [];

    problems.push(...assertBundleCoverage(REPO_ROOT, DENY));

    for (const rel of GUARDED) {
        const abs = join(REPO_ROOT, rel);
        if (!existsSync(abs)) {
            problems.push(`Guarded browser artifact is missing: ${rel} — it was renamed or removed, and this gate is no longer watching it. Update GUARDED.`);
            continue;
        }
        violations.push(...scanSource(readFileSync(abs, 'utf8'), rel));
    }

    for (const rel of GUARDED_MANIFESTS) {
        const abs = join(REPO_ROOT, rel);
        if (!existsSync(abs)) {
            problems.push(`Guarded browser package manifest is missing: ${rel}. Update GUARDED_MANIFESTS.`);
            continue;
        }
        violations.push(...scanManifest(JSON.parse(readFileSync(abs, 'utf8')), rel));
    }

    if (asJson) {
        console.log(JSON.stringify({ problems, violations }, null, 2));
    }

    if (problems.length > 0) {
        for (const p of problems) {
            console.error(`::error::${p}`);
        }
        return 2;
    }

    if (violations.length > 0) {
        for (const v of violations) {
            const where = v.line === null ? `${v.file} (dependency)` : `${v.file}:${v.line}`;
            console.error(`::error file=${v.file}${v.line === null ? '' : `,line=${v.line}`}::Server-only package '${v.pkg}' reached the BROWSER manifest at ${where}.`);
        }
        console.error(
            `::error::${violations.length} server-only import(s) leaked into the browser class-registration manifests. ` +
            `This breaks the MJExplorer bundle with 'Could not resolve \"crypto\"' on a COLD build. ` +
            `Fix: cut the offending dependency edge (see packages/Angular/Bootstrap/CLAUDE.md) — do not add the package to the denylist exceptions.`
        );
        return 1;
    }

    if (!asJson) {
        console.log(`✅ Browser class-registration manifests are free of server-only packages (${GUARDED.length} files + ${GUARDED_MANIFESTS.length} package manifests checked, ${DENY.size} packages denied).`);
    }
    return 0;
}

export { DENY, GUARDED, GUARDED_MANIFESTS, main };

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
    process.exit(main());
}
