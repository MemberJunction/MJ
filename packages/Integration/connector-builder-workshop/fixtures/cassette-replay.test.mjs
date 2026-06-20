import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchCassette, buildReplayHandler } from './cassette-replay.mjs';

test('exact path + method match returns the cassette response', () => {
    const cassettes = [
        { request: { method: 'GET', path: '/contacts' }, response: { status: 200, body: { items: [1, 2, 3] } } },
    ];
    const res = matchCassette({ method: 'GET', path: '/contacts' }, cassettes);
    assert.deepEqual(res, { status: 200, body: { items: [1, 2, 3] } });
});

test('a query-qualified cassette beats a bare one for the same path', () => {
    const bare = { request: { method: 'GET', path: '/contacts' }, response: { status: 200, body: { page: 'all' } } };
    const qualified = {
        request: { method: 'GET', path: '/contacts', query: { page: '2' } },
        response: { status: 200, body: { page: '2' } },
    };
    // Order should not matter — most specific wins regardless of array position.
    const res1 = matchCassette({ method: 'GET', path: '/contacts', query: { page: '2' } }, [bare, qualified]);
    assert.deepEqual(res1, { status: 200, body: { page: '2' } });
    const res2 = matchCassette({ method: 'GET', path: '/contacts', query: { page: '2' } }, [qualified, bare]);
    assert.deepEqual(res2, { status: 200, body: { page: '2' } });

    // A request without the qualifying query still falls back to the bare cassette.
    const resBare = matchCassette({ method: 'GET', path: '/contacts' }, [bare, qualified]);
    assert.deepEqual(resBare, { status: 200, body: { page: 'all' } });
});

test('a bodyContains match selects the right cassette', () => {
    const cassettes = [
        { request: { method: 'POST', path: '/contacts' }, response: { status: 200, body: { matched: 'bare' } } },
        {
            request: { method: 'POST', path: '/contacts', bodyContains: '"email":"a@example.com"' },
            response: { status: 201, body: { id: 'new-1' } },
        },
    ];
    const res = matchCassette(
        { method: 'POST', path: '/contacts', body: { email: 'a@example.com', name: 'A' } },
        cassettes,
    );
    assert.deepEqual(res, { status: 201, body: { id: 'new-1' } });

    // A string body is matched verbatim too.
    const resStr = matchCassette({ method: 'POST', path: '/contacts', body: 'raw email a@example.com here' }, [
        { request: { method: 'POST', path: '/contacts', bodyContains: 'email a@example.com' }, response: { status: 202, body: { ok: true } } },
    ]);
    assert.deepEqual(resStr, { status: 202, body: { ok: true } });
});

test('no match returns null', () => {
    const cassettes = [
        { request: { method: 'GET', path: '/contacts' }, response: { status: 200, body: {} } },
    ];
    assert.equal(matchCassette({ method: 'GET', path: '/companies' }, cassettes), null);
    // bodyContains that is not present → no match.
    const cassettesBody = [
        { request: { method: 'POST', path: '/contacts', bodyContains: 'NOPE' }, response: { status: 201, body: {} } },
    ];
    assert.equal(matchCassette({ method: 'POST', path: '/contacts', body: { x: 1 } }, cassettesBody), null);
    // query key missing → no match.
    const cassettesQuery = [
        { request: { method: 'GET', path: '/contacts', query: { page: '2' } }, response: { status: 200, body: {} } },
    ];
    assert.equal(matchCassette({ method: 'GET', path: '/contacts', query: { other: '1' } }, cassettesQuery), null);
});

test('method matching is case-insensitive', () => {
    const cassettes = [
        { request: { method: 'get', path: '/contacts' }, response: { status: 200, body: { ok: true } } },
    ];
    assert.deepEqual(matchCassette({ method: 'GET', path: '/contacts' }, cassettes), { status: 200, body: { ok: true } });
    assert.deepEqual(matchCassette({ method: 'GeT', path: '/contacts' }, cassettes), { status: 200, body: { ok: true } });
});

test('buildReplayHandler returns a 404 no-cassette response on miss', () => {
    const handler = buildReplayHandler([
        { request: { method: 'GET', path: '/contacts' }, response: { status: 200, body: { ok: true } } },
    ]);
    assert.deepEqual(handler({ method: 'GET', path: '/contacts' }), { status: 200, body: { ok: true } });
    assert.deepEqual(handler({ method: 'GET', path: '/missing' }), { status: 404, body: { error: 'no cassette' } });
});
