#!/usr/bin/env node
/**
 * check-app-token-no-merge.mjs
 *
 * Fails any workflow that BOTH mints a GitHub App token AND merges a pull request.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────────
 * `blue-cypress-ci-bot` is a BYPASS ACTOR on the `next-protect` ruleset. It is the one
 * identity in this repository that can put a commit into `next` through a pull request
 * with no approving review at all — every other actor, the build engineer included, is
 * held to the rule.
 *
 * That power is deliberate and narrow. The bot exists so that release-notes PRs are
 * AUTHORED by something other than the person who has to approve them: GitHub will not let
 * you approve your own PR, so a build engineer who opens his own notes PR needs to find a
 * second human for a file the release already produced. A bot author dissolves that. What
 * the bot must never do is MERGE — because a bot that both opens and merges a PR into
 * `next` is not a review process, it is a direct write with extra steps.
 *
 * Permissions cannot express that boundary. Merging a PR needs `contents: write`, and the
 * bot must already hold `contents: write` to push the notes branch at all; the token that
 * pushes is the token that could merge. So the line between "opens" and "merges" lives
 * nowhere the platform enforces it — it lives in an agreement. Agreements about CI decay
 * into folklore in about six months, usually when the person who made them is on holiday
 * and something needs to ship. This script is that agreement, written where it cannot be
 * forgotten: a red check with the reason in it.
 *
 * ── WHAT THIS CHECK DOES NOT PROVE ──────────────────────────────────────────────
 * This is a WORKFLOW-LEVEL heuristic. It asserts that no single workflow file contains both
 * capabilities. It does NOT prove:
 *
 *   - that the App token was the identity used for a merge. A workflow could mint an App
 *     token for one job and merge with `GITHUB_TOKEN` in another; this flags it anyway.
 *     That false positive is intentional: co-locating the two is the thing worth a second
 *     look, and the opt-out below makes clearing it a one-line, reviewable decision.
 *   - that a merge cannot happen at all. A merge performed inside a script the workflow
 *     invokes, a composite action, a reusable workflow, an `gh` alias, or a URL assembled
 *     from variables at runtime is invisible to a text scan.
 *   - anything about credentials used OUTSIDE CI. A human holding the App's private key can
 *     still merge; this guards the repository's own automation, which is where the rule
 *     would actually erode.
 *
 * Precise token dataflow analysis through shell was considered and rejected. Doing it
 * honestly means modelling variable assignment, `env:` inheritance, heredocs, and every way
 * a secret reaches a subprocess — and its failures would be SILENT ones (a missed merge
 * reported as clean), which is strictly worse than a loud false positive. A coarse rule that
 * a reader can hold in their head, with a documented escape hatch, is the right altitude.
 *
 * ── THE OPT-OUT ─────────────────────────────────────────────────────────────────
 * A legitimate case will eventually exist. It should cost a deliberate line, not the
 * deletion of the guard. Put the marker on the offending line, with a reason:
 *
 *     gh pr merge "$PR" --squash   # app-token-merge-allowed: dependabot lane, never targets next
 *
 * The marker works in YAML and in shell alike because both take `#` comments. A marker with
 * no reason after the colon is itself reported — an unexplained exemption is the folklore
 * this script exists to prevent.
 *
 * ── USAGE ───────────────────────────────────────────────────────────────────────
 *   node .github/scripts/check-app-token-no-merge.mjs [workflow-file ...]
 *
 * With no arguments it scans every workflow in .github/workflows.
 * Exit codes: 0 clean, 1 violations found, 2 usage/IO error.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const WORKFLOWS_DIR = resolve(REPO_ROOT, '.github', 'workflows');

/** The escape hatch. Must be followed by a reason; see the header. */
export const OPT_OUT_MARKER = 'app-token-merge-allowed';
const OPT_OUT_WITH_REASON = new RegExp(`${OPT_OUT_MARKER}\\s*:\\s*\\S`);

/** Minting an App token — the capability half of the pair. */
const APP_TOKEN = /actions\/create-github-app-token(?:[@\s'"]|$)/;

/**
 * The merge half. Each rule is a named way a workflow can merge a PULL REQUEST — never a
 * git merge. `git merge` is how publish.yml does the main -> next back-merge, which is a
 * branch operation that touches no PR and no ruleset; flagging it would fail the repo on
 * day one and teach everyone to ignore this check.
 */
export const MERGE_RULES = [
    {
        code: 'gh-pr-merge',
        // `gh pr merge` in any form. The overwhelmingly common way a workflow merges.
        test: (line) => /\bgh\s+pr\s+merge\b/.test(line),
        describe: '`gh pr merge`',
    },
    {
        code: 'auto-merge',
        // Auto-merge queues the merge for when checks pass, so it merges LATER and without
        // the workflow visibly doing it — the same outcome, harder to spot in a log.
        // `--auto` is required to stand alone (not `--auto-approve`) AND to sit beside a
        // merge signal, so an unrelated tool's `--auto` flag is not swept up.
        test: (line) =>
            (/--auto(?![\w-])/.test(line) && /(?:\bmerge\b|--squash|--rebase)/i.test(line)) ||
            /enable-pull-request-automerge/.test(line),
        describe: 'an auto-merge flag or action',
    },
    {
        code: 'rest-merge',
        // The REST merge endpoint, reached by `gh api`, curl, or octokit. Matching the path
        // shape rather than the verb catches all three, and cannot collide with `git merge`.
        test: (line) => /\/pulls\/[^\s'"`]*\/merge\b/.test(line) || /\bpulls\.merge\s*\(/.test(line),
        describe: 'a REST pull-request merge call',
    },
];

/**
 * Scan one workflow's text. Pure — no I/O, no exits.
 *
 * @param {string} content the workflow YAML, verbatim
 * @param {{ file?: string }} [options] file name used only in messages
 * @returns {{code: string, line: number, message: string}[]} empty when the file is fine
 */
export function checkWorkflowContent(content, { file = '<workflow>' } = {}) {
    if (typeof content !== 'string') {
        throw new TypeError(`checkWorkflowContent expects the workflow text as a string, received ${typeof content}`);
    }

    const lines = content.replace(/\r\n/g, '\n').split('\n');

    // The violation is the PAIR, so the token mint is the cheap discriminator and goes first.
    // A workflow that merges WITHOUT an App token is subject to `next-protect` like every
    // other actor and is none of this guard's business — including its opt-out markers, which
    // are inert there. publish.yml mints tokens constantly and merges nothing; it must stay
    // silent too.
    const mints = lines.flatMap((line, index) => (APP_TOKEN.test(line) ? [index + 1] : []));
    if (mints.length === 0) return [];

    const problems = [];
    const merges = [];
    for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        const rule = MERGE_RULES.find((r) => r.test(line));
        if (!rule) continue;

        if (line.includes(OPT_OUT_MARKER)) {
            // An exemption must say why, or it is indistinguishable from someone silencing
            // the guard to get a run green — which is the failure this whole script guards.
            if (!OPT_OUT_WITH_REASON.test(line)) {
                problems.push({
                    code: 'opt-out-without-reason',
                    line: lineNumber,
                    message:
                        `${file}:${lineNumber} carries the \`${OPT_OUT_MARKER}\` marker with no reason after it. ` +
                        `Write \`# ${OPT_OUT_MARKER}: <why this merge is legitimate>\` — an unexplained exemption is ` +
                        'exactly the folklore this guard exists to prevent.',
                });
            }
            continue;
        }
        merges.push({ rule, line: lineNumber, text: line.trim() });
    }

    for (const merge of merges) {
        problems.push({
            code: merge.rule.code,
            line: merge.line,
            message:
                `${file}:${merge.line} performs a pull-request merge (${merge.rule.describe}) in a workflow that ` +
                `also mints a GitHub App token (line ${mints[0]}). The App identity is a bypass actor on ` +
                '`next-protect`, so a workflow that can both open and merge a PR can write to `next` with no ' +
                'review. Merge with a token that is subject to the ruleset, move the merge to a workflow that ' +
                `mints no App token, or — if this case is genuinely legitimate — append \`# ${OPT_OUT_MARKER}: ` +
                `<reason>\` to that line so the exemption is reviewed rather than assumed. Offending line: ${merge.text}`,
        });
    }

    return problems;
}

/**
 * The workflow files this guard covers. Thin on purpose: the CLI and the test that sweeps
 * the real repository must agree on what "every workflow" means, so there is one definition.
 *
 * @param {string} [dir]
 * @returns {string[]} absolute paths, sorted
 */
export function listWorkflowFiles(dir = WORKFLOWS_DIR) {
    // .yaml as well as .yml: GitHub honours both, so a guard that read only .yml could be
    // stepped around by a rename, which is the least useful way for a check to fail.
    return readdirSync(dir)
        .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
        .sort()
        .map((name) => join(dir, name));
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
    const args = process.argv.slice(2);

    let files;
    if (args.length > 0) {
        files = args.map((a) => resolve(a));
    } else {
        try {
            files = listWorkflowFiles();
        } catch (err) {
            console.error(`::error::cannot read ${WORKFLOWS_DIR}: ${err.message}`);
            process.exit(2);
        }
        if (files.length === 0) {
            // Zero files is never legitimate in this repo, and a guard that passes because it
            // scanned nothing is worse than no guard.
            console.error(`::error::no workflow files found in ${WORKFLOWS_DIR} — refusing to report a pass on an empty scan.`);
            process.exit(2);
        }
    }

    let violations = 0;
    for (const file of files) {
        let content;
        try {
            content = readFileSync(file, 'utf8');
        } catch (err) {
            console.error(`::error::cannot read ${file}: ${err.message}`);
            process.exit(2);
        }
        const problems = checkWorkflowContent(content, { file: file.replace(`${REPO_ROOT}/`, '') });
        for (const p of problems) {
            console.error(`::error file=${file.replace(`${REPO_ROOT}/`, '')},line=${p.line}::${p.message}`);
            violations += 1;
        }
    }

    if (violations > 0) {
        console.error(`\n${violations} violation(s) — see .github/scripts/check-app-token-no-merge.mjs for why this rule exists.`);
        process.exit(1);
    }
    console.log(`::notice::No workflow both mints a GitHub App token and merges a pull request (${files.length} workflow(s) scanned).`);
    process.exit(0);
}
