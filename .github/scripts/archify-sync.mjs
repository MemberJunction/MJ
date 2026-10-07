#!/usr/bin/env node
/**
 * Monthly sync of the vendored archify copy in @memberjunction/ai-diagrams
 * (plans/archify-diagram-skill.md, Phase 3). Driven by .github/workflows/archify-sync.yml.
 *
 * 1. Compare archify's stable.json `source.ref` with the `tag` in UPSTREAM.json. Equal: exit
 *    quietly — no PR, no issue, no comment.
 * 2. Download the release zip, verify `artifact.sha256`, replace the `vendoredPaths` (minus
 *    `exclude`), re-apply archify-shims.patch, regenerate the lite template, update UPSTREAM.json,
 *    add a changeset.
 * 3. Build the package and run its tests, which re-render every upstream example.
 * 4. Diff upstream SKILL.md and references/ between the pinned zip and the new one.
 * 5. Open a PR into `next` on the fixed branch chore/archify-sync, or force-update the one that is
 *    already open. Never merge.
 *
 * WHY TWO CI JOBS (`prepare`, then `publish`): step 3 executes code we downloaded minutes ago and
 * nobody has reviewed yet — that review is what the PR is for. So `prepare` holds no write token,
 * no secret, and saves no cache. `publish` never runs upstream code, and treats everything prepare
 * hands it as untrusted (readMeta): it applies prepare's patch, refuses one that touches anything
 * outside the package and the changeset, then commits and pushes.
 *
 * WHY GITHUB_TOKEN, NOT A PAT: a push or PR made with GITHUB_TOKEN starts no workflows, and here that
 * is the point. CI on this PR runs the vendored upstream code (the example tests import the vendored
 * renderers) with the turbo remote-cache secrets in its env, so it must not run before a human has
 * read that code. The PR body says CI has not run; a maintainer starts it after the review by closing
 * and reopening the PR.
 *
 * EVERY SYNC PR IS A DRAFT, and publish never marks one ready: whether the shims applied and the
 * tests passed is reported by prepare, which ran the upstream code, so it is a claim until CI (started
 * by a maintainer) agrees. WHEN THE SHIMS OR TESTS FAIL the PR also gets a banner and the run then
 * fails. The PR is where the fix happens: it already carries the new upstream files, the release
 * notes and the instruction diff, so failing without one would leave a human to redo the whole
 * sync by hand. Draft keeps unpatched upstream code from being merged; the red run keeps "green"
 * meaning "clean sync".
 *
 * A HUMAN COMMIT on the sync branch (say, a reworked shim patch) stops the force-update: the job
 * fails and names the PR instead of overwriting someone's work.
 *
 * Usage:
 *   node .github/scripts/archify-sync.mjs check                 # decision → $GITHUB_OUTPUT `action`
 *   node .github/scripts/archify-sync.mjs prepare --out DIR     # steps 2–4 in this checkout
 *   node .github/scripts/archify-sync.mjs publish --in DIR      # step 5 (needs GH_TOKEN; CI passes GITHUB_TOKEN)
 *   node .github/scripts/archify-sync.mjs --dry-run [--root DIR]
 *       Rehearses all five steps against the live manifest. Writes only to a temp copy of the
 *       package, skips the build/test and every GitHub write, and prints the PR it would open.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, matchesGlob, normalize, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PKG_NAME = '@memberjunction/ai-diagrams';
export const PKG_DIR = 'packages/AI/Diagrams';
export const VENDOR_DIR = `${PKG_DIR}/vendor/archify`;
export const SHIM_PATCH = `${PKG_DIR}/archify-shims.patch`;
export const LITE_TEMPLATE_SCRIPT = `${PKG_DIR}/scripts/build-lite-template.mjs`;
export const LITE_TEMPLATE = `${PKG_DIR}/assets/template.lite.html`;
export const SYNC_BRANCH = 'chore/archify-sync';
export const BASE_BRANCH = 'next';
export const UPSTREAM_REPO = 'https://github.com/tt-a1i/archify';
export const BOT = { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' };
/** GitHub rejects PR bodies over 65,536 characters; the instruction diff gets whatever is left. */
export const BODY_LIMIT = 60000;

const MARKER = /<!-- archify-sync tag=(v\d+\.\d+\.\d+) -->/;
const TAG = /^v\d+\.\d+\.\d+$/;
const isTag = (t) => typeof t === 'string' && TAG.test(t);
/** The checks prepare reports. publish keeps only these names, so meta.json can't add text of its own to the PR body. */
export const CHECKS = { shims: 'Shim patch (`archify-shims.patch`)', lite: 'Lite template', tests: 'Package build and upstream example tests' };

// ─── Pure logic (unit-tested) ────────────────────────────────────────────────────────────────

/** Compare `vX.Y.Z` / `X.Y.Z` strings numerically. */
export function compareVersions(a, b) {
    const pa = a.replace(/^v/, '').split('.').map(Number);
    const pb = b.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
}

/**
 * Validate stable.json before any of it reaches a URL, a file or a PR body — the same identity
 * checks archify's own update client makes (scripts/update-contract.mjs upstream).
 */
export function validateManifest(m) {
    const ok =
        m?.schemaVersion === 1 &&
        m.skillId === 'archify' &&
        /^\d+\.\d+\.\d+$/.test(m.version) &&
        m.source?.repository === UPSTREAM_REPO &&
        m.source.ref === `v${m.version}` &&
        /^[0-9a-f]{40}$/.test(m.source.treeSha) &&
        /^[0-9a-f]{64}$/.test(m.artifact?.sha256) &&
        /^[a-z]+$/.test(m.severity) &&
        typeof m.publishedAt === 'string';
    if (!ok) throw new Error(`stable.json failed validation; refusing to use it: ${JSON.stringify(m).slice(0, 400)}`);
    return m;
}

/** Release zip for a tag. The manifest's sha256 describes this asset (byte-identical to the archify.zip committed at the tag). */
export const zipUrl = (tag) => `${UPSTREAM_REPO}/releases/download/${tag}/archify.zip`;

export function sha256(buf) {
    return createHash('sha256').update(buf).digest('hex');
}

export function verifySha256(buf, expected, what) {
    const got = sha256(buf);
    if (got !== expected) throw new Error(`${what}: SHA-256 is ${got}, expected ${expected}. Refusing to use it.`);
}

/** Reduce `gh pr list --json number,url,isDraft,body,headRefOid,commits` to what decide() needs. */
export function parseOpenPr(list) {
    const pr = list?.[0];
    if (!pr) return null;
    return {
        number: pr.number,
        url: pr.url,
        isDraft: pr.isDraft,
        headRefOid: pr.headRefOid,
        tag: MARKER.exec(pr.body || '')?.[1] ?? null,
        authors: [...new Set((pr.commits || []).flatMap((c) => (c.authors || []).map((a) => a.email)))],
    };
}

/**
 * The whole sync decision.
 * @returns {{action: 'noop'|'blocked'|'create'|'update', reason?: string, pr?: object}}
 */
export function decide({ pinnedTag, stableRef, openPr }) {
    if (stableRef === pinnedTag) return { action: 'noop', reason: `No new release: pinned ${pinnedTag} is the current stable.` };
    if (compareVersions(stableRef, pinnedTag) < 0) {
        return { action: 'noop', reason: `Pinned ${pinnedTag} is ahead of stable ${stableRef}; not proposing a downgrade.` };
    }
    if (!openPr) return { action: 'create' };
    if (openPr.tag === stableRef) return { action: 'noop', reason: `#${openPr.number} already proposes ${stableRef}.` };
    const others = openPr.authors.filter((e) => e !== BOT.email);
    if (others.length) {
        return {
            action: 'blocked',
            reason:
                `${SYNC_BRANCH} (#${openPr.number}) has commits by ${others.join(', ')}, so it will not be force-updated to ` +
                `${stableRef}. Merge or close #${openPr.number}, or drop those commits, and re-run.`,
        };
    }
    return { action: 'update', pr: openPr };
}

/** Map UPSTREAM.json `vendoredPaths` (relative to the zip's archify/ root) onto vendor/archify/. */
export function vendorPlan(vendoredPaths, zipRoot, vendorRoot) {
    return vendoredPaths.map((p) => {
        const rel = normalize(p);
        if (isAbsolute(rel) || rel === '..' || rel.startsWith('../')) throw new Error(`vendoredPaths entry "${p}" escapes vendor/archify`);
        return { rel, from: join(zipRoot, rel), to: join(vendorRoot, rel) };
    });
}

export const isExcluded = (rel, exclude = []) => exclude.some((g) => matchesGlob(rel, g));

/** Replace every planned path wholesale, so files upstream deleted disappear too. Checks all sources first. */
export function replaceVendored(plan, zipRoot, exclude = []) {
    const missing = plan.filter((p) => !existsSync(p.from)).map((p) => p.rel);
    if (missing.length) throw new Error(`Upstream no longer ships ${missing.join(', ')}. Update vendoredPaths in UPSTREAM.json by hand.`);
    for (const { from, to } of plan) {
        rmSync(to, { recursive: true, force: true });
        mkdirSync(dirname(to), { recursive: true });
        cpSync(from, to, { recursive: true, filter: (src) => !isExcluded(relative(zipRoot, src), exclude) });
    }
}

export function nextUpstream(upstream, manifest) {
    return {
        ...upstream,
        tag: manifest.source.ref,
        version: manifest.version,
        treeSha: manifest.source.treeSha,
        zipSha256: manifest.artifact.sha256,
    };
}

/** Patch per .claude/rules/changesets.md: code, not database or metadata. */
export function changesetFor(from, to) {
    return {
        path: `.changeset/archify-sync-${to.replace(/\./g, '-')}.md`,
        text: `---\n"${PKG_NAME}": patch\n---\n\nSync the vendored archify renderer, schemas, examples and references from ${from} to ${to}.\n`,
    };
}

export const prTitle = (from, to) => `chore(ai-diagrams): sync vendored archify ${from} to ${to}`;

/** Stable releases after `from`, up to and including `to`, oldest first. */
export function releasesBetween(releases, from, to) {
    return releases
        .filter((r) => !r.draft && !r.prerelease && TAG.test(r.tag_name))
        .filter((r) => compareVersions(r.tag_name, from) > 0 && compareVersions(r.tag_name, to) <= 0)
        .sort((a, b) => compareVersions(a.tag_name, b.tag_name));
}

/** A code fence longer than any backtick run inside, so upstream text can't close it early. */
export function fence(text, lang = '') {
    const longest = Math.max(2, ...(text.match(/`+/g) || []).map((s) => s.length));
    const f = '`'.repeat(longest + 1);
    return `${f}${lang}\n${text.endsWith('\n') ? text : `${text}\n`}${f}`;
}

export function clip(text, max, where) {
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max))}\n… truncated ${text.length - max} characters; ${where}\n`;
}

/** Upstream text that has to sit inline (a table cell): one code span nothing can close or split, so markup and @-mentions stay inert. */
export const inline = (text) => `\`${String(text).replace(/[`|\r\n]/g, ' ')}\``;

/**
 * The PR description. Upstream text (release notes, the diff) goes inside code fences, and the
 * little that must sit inline goes through inline(), so its markup, links and @-mentions stay inert
 * in our repository. Never longer than BODY_LIMIT, so GitHub can't reject it after the push.
 */
export function buildPrBody({ from, to, manifest, checks, diff, releases, releasesError }) {
    const failed = checks.filter((c) => c.status === 'FAILED');
    const compare = `${UPSTREAM_REPO}/compare/${from}...${to}`;
    const lines = [`<!-- archify-sync tag=${to} -->`];

    if (failed.length) {
        lines.push(
            '> [!CAUTION]',
            `> **Not ready to merge.** Failed: ${failed.map((c) => c.name).join('; ')}. This PR stays a draft until that is fixed; the output is under "What this sync did".`,
            '',
        );
    }
    if (manifest.severity !== 'normal') {
        lines.push('> [!IMPORTANT]', `> Upstream marks this release \`${manifest.severity}\`. Review it promptly.`, '');
    }
    lines.push(
        '> [!IMPORTANT]',
        "> **CI has not run on this PR, on purpose.** The sync opens and updates it with `GITHUB_TOKEN`, which starts no workflows, because CI would run the vendored upstream code with this repository's secrets in reach before anyone has read it. Review the diff under `vendor/archify/` first, then start CI by closing and reopening this PR. (Pushing a commit also starts CI, but then the monthly job stops instead of updating this branch.)",
        '',
        '> [!WARNING]',
        "> **The upstream instruction text below is prompt content headed for customers' agents.** Whatever we carry from `SKILL.md` and `references/` into the Architecture & Flow Diagrams skill's `Instructions` runs inside every customer's agents, so it is a supply-chain and prompt-injection surface. Read every changed line before folding any of it in. The vendored renderer under `vendor/archify/` is third-party code and gets normal code review.",
        '',
        `Syncs the vendored [archify](${UPSTREAM_REPO}) copy in \`${PKG_NAME}\` from \`${from}\` to \`${to}\`. Opened by \`.github/workflows/archify-sync.yml\` (\`plans/archify-diagram-skill.md\`, Phase 3). Never merged automatically.`,
        '',
        '| | |',
        '|---|---|',
        `| Version | \`${from}\` → \`${to}\` (published ${inline(manifest.publishedAt)}) |`,
        `| Severity | \`${manifest.severity}\` |`,
        `| Zip SHA-256 | \`${manifest.artifact.sha256}\`, as listed in [stable.json](https://tt-a1i.github.io/archify/skill-updates/archify/stable.json), re-fetched when this PR was published. Review the vendored diff itself; publishing does not re-check the files against the zip. |`,
        `| Tree SHA | \`${manifest.source.treeSha}\` |`,
        `| Upstream changes | ${compare} |`,
        '',
        '### What this sync did',
        '',
        `- Replaced the \`vendoredPaths\` listed in \`${PKG_DIR}/UPSTREAM.json\` under \`vendor/archify/\` with the release zip's, minus \`exclude\`.`,
        '- Updated `UPSTREAM.json` (tag, version, treeSha, zipSha256) and added a patch changeset.',
    );
    lines.push('- Checks, as reported by the prepare job (which ran the upstream code, so treat these as claims; CI re-runs the tests once a maintainer starts it):');
    for (const c of checks) lines.push(`  - ${c.name}: **${c.status}**`);
    for (const c of checks.filter((x) => x.status === 'FAILED' && x.output)) {
        const tail = clip(c.output.trim().split('\n').slice(-80).join('\n'), 8000, 'see the workflow run log');
        lines.push('', `<details><summary>${c.name}: output</summary>`, '', fence(tail), '', '</details>');
    }
    lines.push(
        '',
        '### Folding the changes into the skill',
        '',
        "MJ's skill `Instructions` are MJ's own rewrite of upstream's `SKILL.md`, so this PR does not change them. Use the release notes and the instruction diff below to decide what to carry over. Edit the skill under `metadata/` on this branch (that makes the changeset `minor`, per `.claude/rules/changesets.md`), or say here why nothing needs to change.",
        '',
        '### Upstream release notes',
        '',
        'Shown verbatim in code blocks so upstream markup and @-mentions stay inert.',
        '',
    );
    // Built from the validated tag rather than stable.json's own `releaseNotes` string.
    const notesUrl = `${UPSTREAM_REPO}/releases/tag/${to}`;
    if (releasesError) lines.push(`Could not fetch them (${releasesError}). Read them at ${notesUrl} and ${compare}.`, '');
    else if (!releases.length) lines.push(`None found between \`${from}\` and \`${to}\`. See ${notesUrl}.`, '');
    for (const r of releases) {
        lines.push(`#### [${r.tag_name}](${r.html_url}) (${(r.published_at || '').slice(0, 10)})`, '', fence(clip(r.body || '(no release notes)', 6000, `see ${r.html_url}`)), '');
    }

    const footer = [
        '',
        '---',
        `If a newer upstream release lands before this merges, the monthly job force-updates \`${SYNC_BRANCH}\` and rewrites this description. If anyone else has pushed commits here, it stops and fails instead, so that work is never overwritten.`,
    ];
    const diffHead = ['### Instruction diff: `SKILL.md` and `references/`', ''];
    const fixed = [...lines, ...diffHead, ...footer].join('\n').length;
    const diffText = diff.trim()
        ? fence(clip(diff, BODY_LIMIT - fixed - 200, "the full diff is in this PR's Files tab under vendor/archify/"), 'diff')
        : 'No changes to `SKILL.md` or `references/`.';
    const body = [...lines, ...diffHead, diffText, ...footer].join('\n');
    // The diff is clipped to fit above; this catches the rest (many releases, long check output).
    // A cut inside a fence leaves it open to the end, which only makes more of the text inert.
    if (body.length <= BODY_LIMIT) return body;
    const note = `\n… truncated: this description hit GitHub's size limit. Release notes: ${compare}. Full diff: the Files tab.\n`;
    return body.slice(0, BODY_LIMIT - note.length) + note;
}

// ─── I/O ─────────────────────────────────────────────────────────────────────────────────────

/** spawnSync with sane defaults; never throws. Injected everywhere so tests can fake it. */
export function exec(cmd, args, opts = {}) {
    const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...opts });
    return { status: r.error ? -1 : r.status, stdout: r.stdout || '', stderr: r.error ? String(r.error) : r.stderr || '' };
}

function must(run, cmd, args, opts) {
    const r = run(cmd, args, opts);
    if (r.status !== 0) throw new Error(`${cmd} ${args[0]} failed (exit ${r.status}): ${(r.stderr || r.stdout).trim().slice(-2000)}`);
    return r;
}

const repoSlug = () => process.env.GITHUB_REPOSITORY || 'MemberJunction/MJ';
const readUpstream = (root) => JSON.parse(readFileSync(join(root, PKG_DIR, 'UPSTREAM.json'), 'utf8'));

async function download(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`GET ${url}: HTTP ${res.status}`);
    return url.endsWith('.json') ? res.json() : Buffer.from(await res.arrayBuffer());
}

/** A failed read is not "no PR": the caller decides whether that is fatal. */
export function readOpenPr(run, repo) {
    const r = run('gh', ['pr', 'list', '--repo', repo, '--head', SYNC_BRANCH, '--base', BASE_BRANCH, '--state', 'open',
        '--json', 'number,url,isDraft,body,headRefOid,commits']);
    if (r.status !== 0) throw new Error(`could not ask GitHub for an open ${SYNC_BRANCH} PR: ${r.stderr.trim()}`);
    return parseOpenPr(JSON.parse(r.stdout));
}

/** `git apply` silently SKIPS (exit 0) paths outside the cwd's repo, so that counts as a failure too. */
export function applyShims(run, root) {
    const r = run('git', ['apply', '--verbose', `--directory=${VENDOR_DIR}`, SHIM_PATCH], { cwd: root });
    const output = `${r.stdout}${r.stderr}`;
    return { ok: r.status === 0 && !/^Skipped patch/m.test(output), output };
}

const check = (name, ok, output) => ({ name, status: ok ? 'passed' : 'FAILED', output });

/** Steps 2–4. In dry-run, `root` is a disposable copy and the build/test is skipped. */
export async function prepare({ root, run = exec, dryRun = false }) {
    const upstream = readUpstream(root);
    const manifest = validateManifest(await download(upstream.manifest));
    const from = upstream.tag;
    const to = manifest.source.ref;
    const tmp = mkdtempSync(join(tmpdir(), 'archify-sync-'));

    // Step 2: download and verify both zips. The pinned one feeds the step 4 diff.
    const zips = {};
    for (const [tag, expected] of [[from, upstream.zipSha256], [to, manifest.artifact.sha256]]) {
        const buf = await download(zipUrl(tag));
        verifySha256(buf, expected, `archify ${tag} zip`);
        writeFileSync(join(tmp, `${tag}.zip`), buf);
        must(run, 'unzip', ['-q', join(tmp, `${tag}.zip`), '-d', join(tmp, tag)]);
        zips[tag] = join(tmp, tag, 'archify');
        if (!existsSync(zips[tag])) throw new Error(`archify ${tag} zip has no archify/ root`);
    }

    replaceVendored(vendorPlan(upstream.vendoredPaths, zips[to], join(root, VENDOR_DIR)), zips[to], upstream.exclude);
    const shims = applyShims(run, root);
    const lite = run('node', [LITE_TEMPLATE_SCRIPT], { cwd: root });
    writeFileSync(join(root, PKG_DIR, 'UPSTREAM.json'), `${JSON.stringify(nextUpstream(upstream, manifest), null, 2)}\n`);
    const changeset = changesetFor(from, to);
    mkdirSync(join(root, '.changeset'), { recursive: true });
    writeFileSync(join(root, changeset.path), changeset.text);

    const checks = [
        check(CHECKS.shims, shims.ok, shims.output),
        check(CHECKS.lite, lite.status === 0, `${lite.stdout}${lite.stderr}`),
    ];

    // Step 3: re-render every upstream example (the package's own test suite does it).
    const testName = CHECKS.tests;
    if (dryRun) {
        checks.push({ name: testName, status: 'not run (dry run)' });
    } else {
        const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
        // --fail-if-no-match: without it a filter that matches nothing exits 0 and the tests "pass".
        // ponytail: plain pnpm, no turbo remote cache; the package is near dependency-free and this runs monthly.
        const pnpm = (...args) => run('pnpm', ['--fail-if-no-match', ...args], { cwd: root, env });
        const build = pnpm('--filter', `${PKG_NAME}...`, 'run', 'build');
        const test = build.status === 0 ? pnpm('--filter', PKG_NAME, 'test') : build;
        checks.push(check(testName, test.status === 0, `${test.stdout}${test.stderr}`));
    }

    // Step 4: upstream instruction diff, pinned zip vs new zip.
    let diff = '';
    for (const p of ['SKILL.md', 'references']) {
        const r = run('git', ['diff', '--no-index', '--no-color', '--no-prefix', '--stat', '-p', `${from}/archify/${p}`, `${to}/archify/${p}`], { cwd: tmp });
        if (r.status > 1) throw new Error(`instruction diff failed: ${r.stderr}`);
        diff += r.stdout;
    }

    return { from, to, manifest, checks, diff, changeset: changeset.path, needsWork: checks.some((c) => c.status === 'FAILED'), tmp };
}

/** Step 5's text. Release notes come from GitHub at publish time, where a token is available. */
export function assembleBody(meta, run) {
    let releases = [];
    let releasesError = null;
    const r = run('gh', ['api', 'repos/tt-a1i/archify/releases?per_page=100']);
    if (r.status === 0) releases = releasesBetween(JSON.parse(r.stdout), meta.from, meta.to);
    else releasesError = r.stderr.trim().split('\n')[0] || `gh exit ${r.status}`;
    return buildPrBody({ ...meta, releases, releasesError });
}

/**
 * meta.json comes from the job that just ran unreviewed upstream code, which could have rewritten it.
 * So nothing in it passes straight through: the tags must be strict tags, the manifest is validated
 * again and must name `to`, checks survive only under names prepare uses, and the changeset path is
 * recomputed from the tags.
 */
export function readMeta(inDir) {
    const m = JSON.parse(readFileSync(join(inDir, 'meta.json'), 'utf8'));
    if (!isTag(m?.from) || !isTag(m.to)) throw new Error(`meta.json names tags ${JSON.stringify([m?.from, m?.to]).slice(0, 200)}; refusing it`);
    const manifest = validateManifest(m.manifest);
    if (manifest.source.ref !== m.to) throw new Error(`meta.json's manifest is for ${manifest.source.ref}, not ${m.to}; refusing it`);
    const names = Object.values(CHECKS);
    const checks = (Array.isArray(m.checks) ? m.checks : [])
        .filter((c) => names.includes(c?.name) && ['passed', 'FAILED'].includes(c.status))
        .map((c) => ({ name: c.name, status: c.status, output: typeof c.output === 'string' ? c.output : '' }));
    return {
        from: m.from,
        to: m.to,
        manifest,
        checks,
        diff: typeof m.diff === 'string' ? m.diff : '',
        changeset: changesetFor(m.from, m.to).path,
        needsWork: m.needsWork !== false || checks.some((c) => c.status === 'FAILED'),
    };
}

/**
 * meta.json is shaped correctly but still untrusted (readMeta). Its two load-bearing claims are checked
 * against sources the upstream code never touched: the pinned tag must be what UPSTREAM.json on the
 * checked-out base says, and the manifest must equal stable.json fetched again now.
 */
export function verifyAgainstTrustedSources(meta, root, run) {
    const upstream = readUpstream(root);
    if (meta.from !== upstream.tag) {
        throw new Error(`meta.json says the pinned tag is ${meta.from}, but UPSTREAM.json on ${BASE_BRANCH} pins ${upstream.tag}; refusing it`);
    }
    const fresh = validateManifest(JSON.parse(must(run, 'curl', ['-fsSL', '--max-time', '30', upstream.manifest]).stdout));
    const same = fresh.source.ref === meta.manifest.source.ref
        && fresh.source.treeSha === meta.manifest.source.treeSha
        && fresh.artifact.sha256 === meta.manifest.artifact.sha256
        && fresh.version === meta.manifest.version;
    if (!same) {
        throw new Error(`meta.json's manifest (${meta.manifest.source.ref}, ${meta.manifest.artifact.sha256}) does not match stable.json fetched now (${fresh.source.ref}, ${fresh.artifact.sha256}); refusing it`);
    }
    return { upstream, fresh };
}

/** Step 5: commit prepare's patch onto a fresh `next`, push, open or update the PR. Returns the exit code. */
export function publish({ root, inDir, run = exec, repo = repoSlug(), token = process.env.GH_TOKEN }) {
    if (!token) throw new Error('GH_TOKEN is required to publish');
    const meta = readMeta(inDir);
    const trusted = verifyAgainstTrustedSources(meta, root, run);
    // From here on the PR shows the manifest fetched now, never meta.json's copy (publishedAt, severity).
    meta.manifest = trusted.fresh;
    // Asked again here, immediately before the force-push, rather than trusted from `check`.
    const d = decide({ pinnedTag: meta.from, stableRef: meta.to, openPr: readOpenPr(run, repo) });
    if (d.action === 'noop') return console.log(d.reason), 0;
    if (d.action === 'blocked') throw new Error(d.reason);

    const git = (...args) => must(run, 'git', args, { cwd: root });
    git('checkout', '-B', SYNC_BRANCH);
    git('apply', '--index', join(inDir, 'changes.patch'));
    // prepare ran upstream code, so its patch may only touch what a sync writes. Every path on every
    // line is checked, deletions included; --no-renames lists a rename as its delete plus its add,
    // so a rename can't remove a file unseen. A path git quotes (odd characters) fails closed.
    const allowed = [`${PKG_DIR}/UPSTREAM.json`, LITE_TEMPLATE, meta.changeset];
    const stray = git('diff', '--cached', '--name-status', '--no-renames').stdout.split('\n')
        .flatMap((line) => line.split('\t').slice(1))
        .filter((p) => !p.startsWith(`${VENDOR_DIR}/`) && !allowed.includes(p));
    if (stray.length) throw new Error(`the prepared patch touches files a sync never writes: ${stray.join(', ')}. Refusing to commit it.`);
    // UPSTREAM.json is the next sync's trust anchor, so the patch must write exactly what publish computes.
    const expectedUpstream = `${JSON.stringify(nextUpstream(trusted.upstream, trusted.fresh), null, 2)}\n`;
    if (git('show', `:${PKG_DIR}/UPSTREAM.json`).stdout !== expectedUpstream) {
        throw new Error(`the prepared patch writes an UPSTREAM.json that differs from the one computed from ${BASE_BRANCH} and stable.json. Refusing to commit it.`);
    }

    // The body is built (and capped at BODY_LIMIT) before the push, so GitHub rejecting it can't
    // leave a pushed branch with no PR.
    const title = prTitle(meta.from, meta.to);
    const bodyFile = join(inDir, 'body.md');
    writeFileSync(bodyFile, assembleBody(meta, run));

    git('-c', `user.name=${BOT.name}`, '-c', `user.email=${BOT.email}`, 'commit', '-q', '-m', title,
        '-m', `Automated by .github/workflows/archify-sync.yml from ${UPSTREAM_REPO}/releases/tag/${meta.to}.`);
    // GITHUB_TOKEN on purpose (see the header): this push starts no CI on unreviewed upstream code.
    git('remote', 'set-url', 'origin', `https://x-access-token:${token}@github.com/${repo}.git`);
    // The lease pins the head we just inspected, so a commit pushed since then is never overwritten.
    // No open PR means anything on the branch is debris from a dead run or a closed PR.
    const lease = d.action === 'update' ? `--force-with-lease=refs/heads/${SYNC_BRANCH}:${d.pr.headRefOid}` : '--force';
    git('push', lease, 'origin', `HEAD:refs/heads/${SYNC_BRANCH}`);

    const gh = (...args) => must(run, 'gh', [...args, '--repo', repo]);
    if (d.action === 'create') {
        let r;
        try {
            // Always a draft: whether its checks passed is the untrusted prepare job's claim. A maintainer
            // marks it ready after reviewing the vendored diff and seeing CI pass.
            r = gh('pr', 'create', '--base', BASE_BRANCH, '--head', SYNC_BRANCH, '--title', title, '--body-file', bodyFile, '--draft');
        } catch (error) {
            // GITHUB_TOKEN can open a PR only when the repo (or org) allows it. Say so, since the branch is pushed.
            throw new Error(`${error.message}\nThe ${SYNC_BRANCH} branch is pushed but no PR was opened. If this is a permissions error, enable `
                + '"Allow GitHub Actions to create and approve pull requests" (Settings → Actions → General), then re-run the workflow.');
        }
        console.log(`Opened ${r.stdout.trim()}`);
    } else {
        const n = String(d.pr.number);
        gh('pr', 'edit', n, '--title', title, '--body-file', bodyFile);
        // New upstream content goes back to draft until a maintainer reviews it again; never auto-ready.
        if (!d.pr.isDraft) gh('pr', 'ready', n, '--undo');
        console.log(`Updated ${d.pr.url}`);
    }
    if (meta.needsWork) {
        console.error(`::error::archify ${meta.to} synced, but ${meta.checks.filter((c) => c.status === 'FAILED').map((c) => c.name).join('; ')} failed. The PR is a draft; fix it there.`);
        return 1;
    }
    return 0;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────────────────────

async function decideFromRoot(root, run, { tolerateGhFailure = false } = {}) {
    const upstream = readUpstream(root);
    const manifest = validateManifest(await download(upstream.manifest));
    if (manifest.source.ref === upstream.tag) return decide({ pinnedTag: upstream.tag, stableRef: manifest.source.ref, openPr: null });
    let openPr = null;
    try {
        openPr = readOpenPr(run, repoSlug());
    } catch (err) {
        if (!tolerateGhFailure) throw err;
        console.warn(`warning: ${err.message} — assuming no open PR`);
    }
    return { ...decide({ pinnedTag: upstream.tag, stableRef: manifest.source.ref, openPr }), from: upstream.tag, to: manifest.source.ref };
}

async function main(argv) {
    const flag = (name) => {
        const i = argv.indexOf(name);
        return i === -1 ? undefined : argv[i + 1];
    };
    const dryRun = argv.includes('--dry-run');
    const cmd = argv[0]?.startsWith('--') ? 'dry-run' : argv[0];
    const root = resolve(flag('--root') || process.cwd());

    if (cmd === 'check') {
        const d = await decideFromRoot(root, exec);
        const say = d.action === 'blocked' ? `::error::${d.reason}` : d.reason || `${d.action}: ${d.from} → ${d.to}${d.pr ? ` (#${d.pr.number})` : ''}`;
        console.log(say);
        if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `action=${d.action}\n`);
        return d.action === 'blocked' ? 1 : 0;
    }

    if (cmd === 'prepare') {
        const out = resolve(flag('--out') || 'archify-sync-out');
        const meta = await prepare({ root, run: exec });
        mkdirSync(out, { recursive: true });
        must(exec, 'git', ['add', '-A', '--', PKG_DIR, meta.changeset], { cwd: root });
        must(exec, 'git', ['diff', '--cached', '--binary', `--output=${join(out, 'changes.patch')}`], { cwd: root });
        const { tmp, ...rest } = meta;
        writeFileSync(join(out, 'meta.json'), JSON.stringify(rest, null, 2));
        for (const c of meta.checks) console.log(`${c.name}: ${c.status}`);
        return 0; // failures travel in meta.json; publish opens the draft PR, then fails the run
    }

    if (cmd === 'publish') return publish({ root, inDir: resolve(flag('--in') || 'archify-sync-out') });

    if (cmd === 'dry-run' && dryRun) {
        const d = await decideFromRoot(root, exec, { tolerateGhFailure: true });
        if (d.action === 'noop' || d.action === 'blocked') {
            console.log(`[dry run] ${d.reason} Nothing to do.`);
            return d.action === 'blocked' ? 1 : 0;
        }
        const work = mkdtempSync(join(tmpdir(), 'archify-sync-dry-'));
        cpSync(join(root, PKG_DIR), join(work, PKG_DIR), { recursive: true, filter: (s) => !/\/(node_modules|dist)(\/|$)/.test(s) });
        const meta = await prepare({ root: work, run: exec, dryRun: true });
        const what = d.action === 'create'
            ? `open a ${meta.needsWork ? 'DRAFT ' : ''}PR from ${SYNC_BRANCH} into ${BASE_BRANCH}`
            : `force-update ${SYNC_BRANCH} (lease ${d.pr.headRefOid}) and rewrite #${d.pr.number}`;
        console.log(`[dry run] ${meta.from} → ${meta.to}. Would ${what}: "${prTitle(meta.from, meta.to)}"`);
        for (const c of meta.checks) console.log(`[dry run]   ${c.name}: ${c.status}`);
        console.log(`[dry run] Synced copy left at ${work}; zips and diff inputs at ${meta.tmp}\n\n${assembleBody(meta, exec)}`);
        return 0;
    }

    console.error('usage: archify-sync.mjs check | prepare --out DIR | publish --in DIR | --dry-run [--root DIR]');
    return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).then(
        (code) => process.exit(code),
        (err) => {
            console.error(`::error::archify-sync: ${err.message}`);
            process.exit(1);
        },
    );
}
