/**
 * Unit-test backstop alarm — one rolling issue, opened on red and closed on green.
 *
 * The backstop (push to `next` + the nightly schedule) gates nothing: it runs after the
 * merge, so the only way anyone learns `next` is red is if something tells them. The
 * original alert (rkihm-BC #2990) did that with a bare `gh issue create` on every failing
 * run.
 *
 * WHY THIS SCRIPT EXISTS: that alert had no dedupe and no way to stand down. Each red push
 * filed a brand-new issue and nothing ever closed one, so a five-push red window on
 * 2026-08-13 filed five issues, and by 2026-08-14 **140 were open** going back to Aug 4 —
 * against four ever closed, in a single manual sweep on Jul 12. An alarm nobody can silence
 * is an alarm nobody reads, which is strictly worse than no alarm: the next real break
 * arrives invisible, buried in its own backlog.
 *
 * The fix is to make the alarm stateful instead of append-only:
 *
 *   - red   → if an alarm is already open, add a comment to it; only open a new one if none
 *             is open. One incident is one issue, however many merges land inside it.
 *   - green → close whatever is open, citing the run that proved it. The alarm resets
 *             itself, so a fresh issue always means a fresh break.
 *
 * Dedupe keys on the `backstop-alarm` label via the REST issues list, NOT the search API:
 * search is eventually consistent, and consecutive red merges minutes apart are exactly the
 * observed pattern — search lag would let two runs each conclude "nothing open" and file a
 * duplicate, which is the bug this script exists to remove.
 *
 * ERROR POSTURE, stated because it is a deliberate asymmetry:
 *   - `red` exits non-zero on an API failure. The job has already failed, so a loud alarm
 *     failure costs nothing and a silent one costs everything.
 *   - `green` logs `::error::` and exits 0. Failing here would turn a green backstop red,
 *     which would then file an alarm about the alarm. The error is surfaced, never swallowed.
 *
 * Usage:  node .github/scripts/backstop-alarm.mjs red|green
 * Env:    GITHUB_TOKEN (or GH_TOKEN), GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_RUN_ID,
 *         GITHUB_SERVER_URL, GITHUB_EVENT_NAME
 * Exit:   0 = handled, 1 = API failure on the red path, 2 = usage/env error
 */

import { pathToFileURL } from 'node:url';

/** Label that identifies an alarm issue. The dedupe key — never rename without a migration. */
export const ALARM_LABEL = 'backstop-alarm';

/** Fixed title, so the rolling issue reads the same whichever run opened it. */
export const ALARM_TITLE = '🔴 Unit-test backstop is red on `next`';

/** Never touch more than this many issues in one run — a runaway-loop backstop, not a real limit. */
export const MAX_ISSUES_PER_RUN = 50;

/**
 * Body for a newly opened alarm.
 * @param {{event: string, sha: string, runUrl: string}} ctx
 */
export function buildOpenBody(ctx) {
    return [
        `The full-suite **backstop** (\`${ctx.event}\`) failed on \`next\`, so a break slipped past PR`,
        'affected-filtering and `next` is red.',
        '',
        `- First red run: ${ctx.runUrl}`,
        `- Commit: \`${ctx.sha.slice(0, 7)}\``,
        '',
        'Please triage per CONTRIBUTING. **This issue is the rolling alarm**: further red merges',
        'comment here rather than opening new issues, and it closes itself as soon as a backstop',
        'run goes green. If you are reading a *new* issue, the break is new.',
    ].join('\n');
}

/**
 * Comment added when the alarm is already open and another run goes red.
 * @param {{event: string, sha: string, runUrl: string}} ctx
 */
export function buildStillRedComment(ctx) {
    return `Still red — \`${ctx.sha.slice(0, 7)}\` (\`${ctx.event}\`) also failed the backstop: ${ctx.runUrl}`;
}

/**
 * Comment added when closing on a green run.
 * @param {{sha: string, runUrl: string}} ctx
 */
export function buildResolvedComment(ctx) {
    return `Resolved — the backstop is green again at \`${ctx.sha.slice(0, 7)}\`: ${ctx.runUrl}\n\nClosed automatically. Reopen if the failure returns.`;
}

/**
 * Read the run context out of the environment, asserting everything the callers need.
 * @param {Record<string, string|undefined>} env
 */
export function readContext(env) {
    const repository = env.GITHUB_REPOSITORY;
    const token = env.GITHUB_TOKEN || env.GH_TOKEN;
    if (!repository) throw new Error('GITHUB_REPOSITORY is required');
    if (!token) throw new Error('GITHUB_TOKEN or GH_TOKEN is required');

    const [owner, repo] = repository.split('/');
    if (!owner || !repo) throw new Error(`GITHUB_REPOSITORY must be owner/repo, got "${repository}"`);

    const server = env.GITHUB_SERVER_URL || 'https://github.com';
    return {
        owner,
        repo,
        token,
        sha: env.GITHUB_SHA || 'unknown',
        event: env.GITHUB_EVENT_NAME || 'unknown',
        runUrl: `${server}/${repository}/actions/runs/${env.GITHUB_RUN_ID || '0'}`,
    };
}

/**
 * Minimal GitHub REST client. Isolated so the handlers below are pure with respect to I/O
 * and can be driven by a fake in tests.
 * @param {{owner: string, repo: string, token: string}} ctx
 */
export function createApi(ctx) {
    const base = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}`;
    return async function request(method, path, body) {
        const res = await fetch(`${base}${path}`, {
            method,
            headers: {
                accept: 'application/vnd.github+json',
                authorization: `Bearer ${ctx.token}`,
                'x-github-api-version': '2022-11-28',
                ...(body ? { 'content-type': 'application/json' } : {}),
            },
            ...(body ? { body: JSON.stringify(body) } : {}),
        });
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        return { status: res.status, body: json };
    };
}

/**
 * Create the alarm label if it is missing. Idempotent: an existing label returns 422, which
 * is the success case on every run after the first.
 * @param {(m: string, p: string, b?: object) => Promise<{status: number, body: any}>} request
 */
export async function ensureLabel(request) {
    const res = await request('POST', '/labels', {
        name: ALARM_LABEL,
        color: 'b60205',
        description: 'Auto-filed by the unit-test backstop; closes itself when the backstop goes green',
    });
    if (res.status === 201 || res.status === 422) return;
    throw new Error(`could not ensure the ${ALARM_LABEL} label (HTTP ${res.status})`);
}

/**
 * List open alarm issues, newest first. Uses the label filter rather than search so the
 * result is strongly consistent (see the header note on search lag).
 * @param {(m: string, p: string, b?: object) => Promise<{status: number, body: any}>} request
 */
export async function findOpenAlarms(request) {
    const res = await request('GET', `/issues?state=open&labels=${ALARM_LABEL}&per_page=100`);
    if (res.status !== 200) throw new Error(`could not list ${ALARM_LABEL} issues (HTTP ${res.status})`);
    // The issues endpoint returns PRs too; a PR carries a `pull_request` key. Ours never are,
    // but filtering keeps a mislabeled PR from being commented on or closed.
    return (res.body || []).filter((i) => !i.pull_request);
}

/**
 * Red path: comment on the open alarm, or open one if there is none.
 * @returns {Promise<{action: 'commented'|'opened', issue: number}>}
 */
export async function handleRed(request, ctx) {
    // Ensure the label FIRST, before it is used as a filter. On the very first run after this
    // ships the label does not exist yet, and "list issues with a label that does not exist" is
    // not a contract worth betting the dedupe on — create it, then query. Idempotent and cheap.
    await ensureLabel(request);
    const open = await findOpenAlarms(request);

    if (open.length > 0) {
        const target = open[0];
        const res = await request('POST', `/issues/${target.number}/comments`, {
            body: buildStillRedComment(ctx),
        });
        if (res.status !== 201) throw new Error(`could not comment on #${target.number} (HTTP ${res.status})`);
        return { action: 'commented', issue: target.number };
    }

    const res = await request('POST', '/issues', {
        title: ALARM_TITLE,
        body: buildOpenBody(ctx),
        labels: [ALARM_LABEL],
    });
    if (res.status !== 201) throw new Error(`could not open the alarm issue (HTTP ${res.status})`);
    return { action: 'opened', issue: res.body.number };
}

/**
 * Green path: close every open alarm, citing the run that proved it green.
 * @returns {Promise<{closed: number[], failed: number[]}>}
 */
export async function handleGreen(request, ctx) {
    const open = await findOpenAlarms(request);
    const closed = [];
    const failed = [];

    for (const issue of open.slice(0, MAX_ISSUES_PER_RUN)) {
        const commented = await request('POST', `/issues/${issue.number}/comments`, {
            body: buildResolvedComment(ctx),
        });
        const shut = await request('PATCH', `/issues/${issue.number}`, {
            state: 'closed',
            state_reason: 'completed',
        });
        if (commented.status === 201 && shut.status === 200) closed.push(issue.number);
        else failed.push(issue.number);
    }

    if (open.length > MAX_ISSUES_PER_RUN) {
        failed.push(...open.slice(MAX_ISSUES_PER_RUN).map((i) => i.number));
    }
    return { closed, failed };
}

async function main() {
    const mode = process.argv[2];
    if (mode !== 'red' && mode !== 'green') {
        console.error('usage: node .github/scripts/backstop-alarm.mjs red|green');
        process.exit(2);
    }

    let ctx;
    try {
        ctx = readContext(process.env);
    } catch (err) {
        console.error(`::error::backstop-alarm: ${err.message}`);
        process.exit(2);
    }

    const request = createApi(ctx);

    if (mode === 'red') {
        // Loud on failure: the job is already red, so an unreported alarm is the only real loss.
        try {
            const result = await handleRed(request, ctx);
            console.log(`backstop-alarm: ${result.action} #${result.issue}`);
        } catch (err) {
            console.error(`::error::Backstop failed AND the alarm could not be filed (${err.message}) — see ${ctx.runUrl}`);
            process.exit(1);
        }
        return;
    }

    // Quiet-but-visible on failure: turning a green backstop red here would file an alarm
    // about the alarm. Surface it and move on.
    try {
        const { closed, failed } = await handleGreen(request, ctx);
        if (closed.length) console.log(`backstop-alarm: closed ${closed.map((n) => `#${n}`).join(', ')}`);
        if (failed.length) console.error(`::error::backstop-alarm: could not close ${failed.map((n) => `#${n}`).join(', ')}`);
    } catch (err) {
        console.error(`::error::backstop-alarm: green-path cleanup failed (${err.message}) — open alarms may be stale`);
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}
