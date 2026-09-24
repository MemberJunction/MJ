// Tests for .github/scripts/backstop-alarm.mjs
// Run with: npx vitest run --config .github/scripts/vitest.config.mts
import { describe, it, expect } from 'vitest';
import {
    ALARM_LABEL,
    ALARM_TITLE,
    MAX_ISSUES_PER_RUN,
    buildOpenBody,
    buildStillRedComment,
    buildResolvedComment,
    readContext,
    ensureLabel,
    findOpenAlarms,
    handleRed,
    handleGreen,
} from '../backstop-alarm.mjs';

/**
 * A fake REST client. Records every call so the tests can assert on the exact traffic —
 * the whole point of this script is *which* requests it makes, not what it returns.
 */
function fakeApi(routes) {
    const calls = [];
    const request = async (method, path, body) => {
        calls.push({ method, path, body });
        for (const [pattern, respond] of routes) {
            if (pattern.method === method && pattern.test.test(path)) {
                return typeof respond === 'function' ? respond(calls.length) : respond;
            }
        }
        throw new Error(`unrouted request: ${method} ${path}`);
    };
    return { request, calls };
}

const CTX = {
    event: 'push',
    sha: 'beae186aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    runUrl: 'https://github.com/MemberJunction/MJ/actions/runs/123',
};

const issue = (number) => ({ number, title: ALARM_TITLE });

describe('readContext', () => {
    it('derives owner, repo and run URL', () => {
        const ctx = readContext({
            GITHUB_REPOSITORY: 'MemberJunction/MJ',
            GITHUB_TOKEN: 't',
            GITHUB_SHA: 'abc1234def',
            GITHUB_RUN_ID: '99',
            GITHUB_EVENT_NAME: 'schedule',
        });
        expect(ctx.owner).toBe('MemberJunction');
        expect(ctx.repo).toBe('MJ');
        expect(ctx.runUrl).toBe('https://github.com/MemberJunction/MJ/actions/runs/99');
        expect(ctx.event).toBe('schedule');
    });

    it('accepts GH_TOKEN as well as GITHUB_TOKEN', () => {
        const ctx = readContext({ GITHUB_REPOSITORY: 'o/r', GH_TOKEN: 't' });
        expect(ctx.token).toBe('t');
    });

    it('refuses to run without a repository or a token', () => {
        expect(() => readContext({ GITHUB_TOKEN: 't' })).toThrow(/GITHUB_REPOSITORY/);
        expect(() => readContext({ GITHUB_REPOSITORY: 'o/r' })).toThrow(/TOKEN/);
        expect(() => readContext({ GITHUB_REPOSITORY: 'nope', GITHUB_TOKEN: 't' })).toThrow(/owner\/repo/);
    });
});

describe('message bodies', () => {
    it('short-shas everything a human reads', () => {
        expect(buildOpenBody(CTX)).toContain('`beae186`');
        expect(buildStillRedComment(CTX)).toContain('`beae186`');
        expect(buildResolvedComment(CTX)).toContain('`beae186`');
    });

    it('always carries the run URL', () => {
        for (const body of [buildOpenBody(CTX), buildStillRedComment(CTX), buildResolvedComment(CTX)]) {
            expect(body).toContain(CTX.runUrl);
        }
    });

    it('tells the reader that a new issue means a new break', () => {
        expect(buildOpenBody(CTX)).toMatch(/rolling alarm/i);
    });
});

describe('ensureLabel', () => {
    it('treats an already-existing label as success', async () => {
        const { request } = fakeApi([[{ method: 'POST', test: /^\/labels$/ }, { status: 422, body: {} }]]);
        await expect(ensureLabel(request)).resolves.toBeUndefined();
    });

    it('treats a fresh creation as success', async () => {
        const { request } = fakeApi([[{ method: 'POST', test: /^\/labels$/ }, { status: 201, body: {} }]]);
        await expect(ensureLabel(request)).resolves.toBeUndefined();
    });

    it('raises on any other status rather than continuing blind', async () => {
        const { request } = fakeApi([[{ method: 'POST', test: /^\/labels$/ }, { status: 403, body: {} }]]);
        await expect(ensureLabel(request)).rejects.toThrow(/HTTP 403/);
    });
});

describe('findOpenAlarms', () => {
    it('queries by label, not by search — search lag is what caused the duplicates', async () => {
        const { request, calls } = fakeApi([
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [issue(1)] }],
        ]);
        await findOpenAlarms(request);
        expect(calls[0].path).toContain(`labels=${ALARM_LABEL}`);
        expect(calls[0].path).toContain('state=open');
        expect(calls[0].path).not.toContain('/search');
    });

    it('drops pull requests that happen to carry the label', async () => {
        const { request } = fakeApi([
            [
                { method: 'GET', test: /^\/issues\?/ },
                { status: 200, body: [issue(1), { number: 2, pull_request: { url: 'x' } }] },
            ],
        ]);
        expect(await findOpenAlarms(request)).toEqual([issue(1)]);
    });

    it('raises rather than reporting "nothing open" on an API error', async () => {
        const { request } = fakeApi([[{ method: 'GET', test: /^\/issues\?/ }, { status: 500, body: null }]]);
        await expect(findOpenAlarms(request)).rejects.toThrow(/HTTP 500/);
    });
});

describe('handleRed — the dedupe that did not exist', () => {
    it('opens exactly one issue when nothing is open', async () => {
        const { request, calls } = fakeApi([
            [{ method: 'POST', test: /^\/labels$/ }, { status: 422, body: {} }],
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [] }],
            [{ method: 'POST', test: /^\/issues$/ }, { status: 201, body: { number: 4242 } }],
        ]);
        expect(await handleRed(request, CTX)).toEqual({ action: 'opened', issue: 4242 });

        const created = calls.filter((c) => c.method === 'POST' && c.path === '/issues');
        expect(created).toHaveLength(1);
        expect(created[0].body.title).toBe(ALARM_TITLE);
        expect(created[0].body.labels).toEqual([ALARM_LABEL]);
    });

    it('comments instead of filing a second issue when one is already open', async () => {
        const { request, calls } = fakeApi([
            [{ method: 'POST', test: /^\/labels$/ }, { status: 422, body: {} }],
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [issue(7), issue(8)] }],
            [{ method: 'POST', test: /^\/issues\/7\/comments$/ }, { status: 201, body: {} }],
        ]);
        expect(await handleRed(request, CTX)).toEqual({ action: 'commented', issue: 7 });
        expect(calls.some((c) => c.method === 'POST' && c.path === '/issues')).toBe(false);
    });

    it('creates the label BEFORE using it as a filter (first-run ordering)', async () => {
        const { request, calls } = fakeApi([
            [{ method: 'POST', test: /^\/labels$/ }, { status: 201, body: {} }],
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [] }],
            [{ method: 'POST', test: /^\/issues$/ }, { status: 201, body: { number: 1 } }],
        ]);
        await handleRed(request, CTX);
        expect(calls[0]).toMatchObject({ method: 'POST', path: '/labels' });
        expect(calls[1].method).toBe('GET');
    });

    it('files ONE issue across a five-red-push window (the Aug 13 regression)', async () => {
        // Models the real incident: five consecutive red merges. State carries between runs
        // exactly as the live label filter would.
        const openIssues = [];
        const { request, calls } = fakeApi([
            [{ method: 'GET', test: /^\/issues\?/ }, () => ({ status: 200, body: [...openIssues] })],
            [{ method: 'POST', test: /^\/labels$/ }, { status: 422, body: {} }],
            [
                { method: 'POST', test: /^\/issues$/ },
                () => {
                    openIssues.push(issue(100));
                    return { status: 201, body: { number: 100 } };
                },
            ],
            [{ method: 'POST', test: /^\/issues\/100\/comments$/ }, { status: 201, body: {} }],
        ]);

        for (const sha of ['69732c0', 'beae186', '7f84861', 'e51cfa3', '2741d46']) {
            await handleRed(request, { ...CTX, sha });
        }

        expect(calls.filter((c) => c.method === 'POST' && c.path === '/issues')).toHaveLength(1);
        expect(calls.filter((c) => c.path === '/issues/100/comments')).toHaveLength(4);
    });

    it('raises when the comment fails, so the workflow can go loud', async () => {
        const { request } = fakeApi([
            [{ method: 'POST', test: /^\/labels$/ }, { status: 422, body: {} }],
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [issue(7)] }],
            [{ method: 'POST', test: /^\/issues\/7\/comments$/ }, { status: 403, body: {} }],
        ]);
        await expect(handleRed(request, CTX)).rejects.toThrow(/HTTP 403/);
    });

    it('raises when issue creation fails', async () => {
        const { request } = fakeApi([
            [{ method: 'POST', test: /^\/labels$/ }, { status: 422, body: {} }],
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [] }],
            [{ method: 'POST', test: /^\/issues$/ }, { status: 410, body: {} }],
        ]);
        await expect(handleRed(request, CTX)).rejects.toThrow(/HTTP 410/);
    });
});

describe('handleGreen — the reset that did not exist', () => {
    it('closes every open alarm and comments on each', async () => {
        const { request, calls } = fakeApi([
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [issue(1), issue(2)] }],
            [{ method: 'POST', test: /^\/issues\/\d+\/comments$/ }, { status: 201, body: {} }],
            [{ method: 'PATCH', test: /^\/issues\/\d+$/ }, { status: 200, body: {} }],
        ]);
        expect(await handleGreen(request, CTX)).toEqual({ closed: [1, 2], failed: [] });

        const patches = calls.filter((c) => c.method === 'PATCH');
        expect(patches).toHaveLength(2);
        expect(patches[0].body).toEqual({ state: 'closed', state_reason: 'completed' });
    });

    it('is a no-op when nothing is open', async () => {
        const { request, calls } = fakeApi([
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [] }],
        ]);
        expect(await handleGreen(request, CTX)).toEqual({ closed: [], failed: [] });
        expect(calls).toHaveLength(1);
    });

    it('reports partial failure instead of claiming success', async () => {
        const { request } = fakeApi([
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: [issue(1), issue(2)] }],
            [{ method: 'POST', test: /^\/issues\/\d+\/comments$/ }, { status: 201, body: {} }],
            [
                { method: 'PATCH', test: /^\/issues\/\d+$/ },
                (n) => ({ status: n > 3 ? 500 : 200, body: {} }),
            ],
        ]);
        const result = await handleGreen(request, CTX);
        expect(result.closed).toEqual([1]);
        expect(result.failed).toEqual([2]);
    });

    it('bounds the loop and reports what it did not reach', async () => {
        const many = Array.from({ length: MAX_ISSUES_PER_RUN + 3 }, (_, i) => issue(i + 1));
        const { request } = fakeApi([
            [{ method: 'GET', test: /^\/issues\?/ }, { status: 200, body: many }],
            [{ method: 'POST', test: /^\/issues\/\d+\/comments$/ }, { status: 201, body: {} }],
            [{ method: 'PATCH', test: /^\/issues\/\d+$/ }, { status: 200, body: {} }],
        ]);
        const result = await handleGreen(request, CTX);
        expect(result.closed).toHaveLength(MAX_ISSUES_PER_RUN);
        expect(result.failed).toEqual([
            MAX_ISSUES_PER_RUN + 1,
            MAX_ISSUES_PER_RUN + 2,
            MAX_ISSUES_PER_RUN + 3,
        ]);
    });
});
