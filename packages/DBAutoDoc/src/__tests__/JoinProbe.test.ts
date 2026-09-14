import { describe, it, expect } from 'vitest';
import {
    KeyVerifier,
    KeyCandidate,
    candidateKey,
    stampFor,
    DEFAULT_KEY_VERIFICATION,
} from '../discovery/JoinProbe.js';
import { BaseAutoDocDriver, DriverProbeOutcome } from '../drivers/BaseAutoDocDriver.js';
import { describeProbeFailure, sanitizeErrorText, extractSqlState } from '../drivers/probeErrors.js';

/**
 * A driver that only implements the probe. Everything else on BaseAutoDocDriver is
 * irrelevant here, so the fake is cast through a declared shape rather than stubbing
 * forty abstract methods — no `any`, and the probe contract stays fully typed.
 */
interface ProbeOnlyDriver {
    probeJoinContainment(
        child: { schema: string; table: string; column: string },
        parent: { schema: string; table: string; column: string },
        sampleSize: number,
        timeoutMs: number,
    ): Promise<DriverProbeOutcome>;
}

interface ProbeCall {
    child: string;
    parent: string;
    sampleSize: number;
    timeoutMs: number;
}

function fakeDriver(
    respond: (call: ProbeCall) => DriverProbeOutcome,
): { driver: BaseAutoDocDriver; calls: ProbeCall[] } {
    const calls: ProbeCall[] = [];
    const impl: ProbeOnlyDriver = {
        probeJoinContainment: async (child, parent, sampleSize, timeoutMs) => {
            const call: ProbeCall = {
                child: `${child.schema}.${child.table}.${child.column}`,
                parent: `${parent.schema}.${parent.table}.${parent.column}`,
                sampleSize,
                timeoutMs,
            };
            calls.push(call);
            return respond(call);
        },
    };
    return { driver: impl as unknown as BaseAutoDocDriver, calls };
}

function edge(child: string, parent: string): KeyCandidate {
    const split = (s: string) => {
        const [schema, table, column] = s.split('.');
        return { schema, table, column };
    };
    return { child: split(child), parent: split(parent) };
}

describe('KeyVerifier — the three outcomes are distinct', () => {
    it('Verified when containment clears the floor, and reports the counts', async () => {
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 1000, matchedValues: 988 }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('elevate.app_user.remote_user_id', 'netforum.co_customer.cst_key'));

        expect(r.status).toBe('Verified');
        expect(r.containment).not.toBeNull();
        expect(r.containment?.sampledValues).toBe(1000);
        expect(r.containment?.matchedValues).toBe(988);
        expect(r.containment?.containment).toBeCloseTo(0.988, 5);
        expect(r.reason).toContain('988 of 1000');
    });

    it('Refuted when the probe RAN and measured zero — the MJC-128 shape', async () => {
        // acgi.address.cust_id holds a bare id; acgi.customer.record_key is namespaced
        // 'AA:<id>'. The join is generated, returns nothing, and raises no error.
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 1000, matchedValues: 0 }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('acgi.address.cust_id', 'acgi.customer.record_key'));

        expect(r.status).toBe('Refuted');
        expect(r.containment?.matchedValues).toBe(0);
        expect(r.containment?.sampledValues).toBe(1000);
        expect(r.reason).toContain('below');
    });

    it('Unprobed — NOT Refuted — when the driver could not evaluate the join', async () => {
        // This is the distinction the whole module exists for. `testValueOverlap`
        // returns a bare number and reports this case as 0, which a containment gate
        // then reads as a refutation, silently deleting a candidate that may be correct.
        const { driver } = fakeDriver(() => ({
            ok: false,
            reason: 'columns are not comparable (type mismatch)',
            code: '42883',
        }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('elevate.membership.customer_key', 'netforum.membership_ref.customer_key'));

        expect(r.status).toBe('Unprobed');
        expect(r.status).not.toBe('Refuted');
        expect(r.containment).toBeNull();
        expect(r.reason).toContain('not comparable');
    });

    it('Unprobed when the child column has nothing to sample', async () => {
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 0, matchedValues: 0 }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('a.t.c', 'b.u.d'));

        expect(r.status).toBe('Unprobed');
        expect(r.containment).toBeNull();
    });

    it('a sparse-but-real soft key is Verified, not Refuted', async () => {
        // 6% containment: a connector schema full of orphans. The floor exists to catch
        // 0%, not to adjudicate FK quality — that is FKDetector's 75% GATE 6.
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 1000, matchedValues: 60 }));
        const v = new KeyVerifier(driver);
        expect((await v.verify(edge('a.t.c', 'b.u.d'))).status).toBe('Verified');
    });
});

describe('KeyVerifier — the bound', () => {
    it('stops probing at maxProbes and reports every later candidate Unprobed', async () => {
        const { driver, calls } = fakeDriver(() => ({ ok: true, sampledValues: 10, matchedValues: 10 }));
        const v = new KeyVerifier(driver, { maxProbes: 3 });

        const results = await v.verifyAll([
            edge('s.t1.c', 's.p.k'),
            edge('s.t2.c', 's.p.k'),
            edge('s.t3.c', 's.p.k'),
            edge('s.t4.c', 's.p.k'),
            edge('s.t5.c', 's.p.k'),
        ]);

        // Exactly three queries reached the database — the cap is a real cap.
        expect(calls.length).toBe(3);
        expect(results.get(candidateKey(edge('s.t3.c', 's.p.k')))?.status).toBe('Verified');
        expect(results.get(candidateKey(edge('s.t4.c', 's.p.k')))?.status).toBe('Unprobed');
        expect(results.get(candidateKey(edge('s.t5.c', 's.p.k')))?.reason).toContain('budget exhausted');
        expect(v.budget.exhausted).toBe(true);
        expect(v.budget.probesUsed).toBe(3);
    });

    it('passes the configured sampleSize and timeout through to the driver', async () => {
        const { driver, calls } = fakeDriver(() => ({ ok: true, sampledValues: 5, matchedValues: 5 }));
        const v = new KeyVerifier(driver, { sampleSize: 250, probeTimeoutMs: 1234 });
        await v.verify(edge('s.t.c', 's.p.k'));

        expect(calls[0].sampleSize).toBe(250);
        expect(calls[0].timeoutMs).toBe(1234);
    });

    it('caches by edge so the same candidate costs one probe, not N', async () => {
        const { driver, calls } = fakeDriver(() => ({ ok: true, sampledValues: 10, matchedValues: 9 }));
        const v = new KeyVerifier(driver);
        await v.verify(edge('s.t.c', 's.p.k'));
        await v.verify(edge('s.t.c', 's.p.k'));
        await v.verify(edge('S.T.C', 'S.P.K')); // case-insensitive same edge

        expect(calls.length).toBe(1);
        expect(v.budget.probesUsed).toBe(1);
    });

    it('probes nothing when disabled, and calls the result Unprobed rather than Verified', async () => {
        const { driver, calls } = fakeDriver(() => ({ ok: true, sampledValues: 10, matchedValues: 10 }));
        const v = new KeyVerifier(driver, { enabled: false });
        const r = await v.verify(edge('s.t.c', 's.p.k'));

        expect(calls.length).toBe(0);
        expect(r.status).toBe('Unprobed');
        expect(r.status).not.toBe('Verified');
    });

    it('is Unprobed, never Verified, with no driver at all', async () => {
        const v = new KeyVerifier(null);
        const r = await v.verify(edge('s.t.c', 's.p.k'));
        expect(r.status).toBe('Unprobed');
        expect(r.reason).toContain('no database driver');
    });

    it('does not probe a column against itself', async () => {
        const { driver, calls } = fakeDriver(() => ({ ok: true, sampledValues: 10, matchedValues: 10 }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('s.t.c', 's.t.c'));
        expect(calls.length).toBe(0);
        expect(r.status).toBe('Unprobed');
    });

    it('the documented defaults are the actual defaults', async () => {
        const { driver, calls } = fakeDriver(() => ({ ok: true, sampledValues: 1, matchedValues: 1 }));
        const v = new KeyVerifier(driver);
        await v.verify(edge('s.t.c', 's.p.k'));

        expect(DEFAULT_KEY_VERIFICATION.sampleSize).toBe(1000);
        expect(DEFAULT_KEY_VERIFICATION.maxProbes).toBe(500);
        expect(DEFAULT_KEY_VERIFICATION.probeTimeoutMs).toBe(5000);
        expect(DEFAULT_KEY_VERIFICATION.minContainment).toBe(0.05);
        expect(calls[0].sampleSize).toBe(DEFAULT_KEY_VERIFICATION.sampleSize);
        expect(v.resolvedConfig.maxProbes).toBe(DEFAULT_KEY_VERIFICATION.maxProbes);
    });

    it('an explicit partial config keeps the defaults for every other field', async () => {
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 1, matchedValues: 1 }));
        const v = new KeyVerifier(driver, { maxProbes: 7 });
        expect(v.resolvedConfig.maxProbes).toBe(7);
        expect(v.resolvedConfig.sampleSize).toBe(DEFAULT_KEY_VERIFICATION.sampleSize);
        expect(v.resolvedConfig.enabled).toBe(true);
    });
});

describe('the probe cannot carry a data value', () => {
    it('a Verified result exposes counts and nothing value-shaped', async () => {
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 5000, matchedValues: 4812 }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('s.t.c', 's.p.k'));

        // "4,812 of 5,000 matched" is the maximum resolution. Assert structurally: the
        // containment object has exactly the three numeric count fields and no other.
        expect(Object.keys(r.containment ?? {}).sort()).toEqual(
            ['containment', 'matchedValues', 'sampledValues'],
        );
        for (const val of Object.values(r.containment ?? {})) {
            expect(typeof val).toBe('number');
        }
        // The stamp that gets persisted is counts + prose only.
        const stamp = stampFor('LLM', r);
        expect(typeof stamp.MatchedRows).toBe('number');
        expect(typeof stamp.SampledRows).toBe('number');
        expect(Object.keys(stamp).sort()).toEqual(
            ['MatchedRows', 'Provenance', 'SampledRows', 'VerificationNote', 'VerifiedAt', 'Verification'].sort(),
        );
    });

    it('an Unprobed stamp records null counts, never a fabricated zero', async () => {
        const v = new KeyVerifier(null);
        const stamp = stampFor('Organic', await v.verify(edge('s.t.c', 's.p.k')));
        expect(stamp.Verification).toBe('Unprobed');
        expect(stamp.MatchedRows).toBeNull();
        expect(stamp.SampledRows).toBeNull();
    });

    it('stampFor carries the provenance it was given', async () => {
        const { driver } = fakeDriver(() => ({ ok: true, sampledValues: 10, matchedValues: 10 }));
        const v = new KeyVerifier(driver);
        const r = await v.verify(edge('s.t.c', 's.p.k'));
        expect(stampFor('Declared', r).Provenance).toBe('Declared');
        expect(stampFor('LLM', r).Provenance).toBe('LLM');
    });
});

describe('probe failure reasons never leak a value', () => {
    it('strips single-quoted, double-quoted, backticked and bracketed runs', () => {
        const cleaned = sanitizeErrorText(
            `invalid input syntax for type uuid: "AA:1000000" near 'secret@example.com' in [SSN] and \`4111111111111111\``,
        );
        expect(cleaned).not.toContain('AA:1000000');
        expect(cleaned).not.toContain('secret@example.com');
        expect(cleaned).not.toContain('SSN');
        expect(cleaned).not.toContain('4111111111111111');
    });

    it('strips long unquoted tokens, which are values far more often than words', () => {
        const cleaned = sanitizeErrorText('could not convert 3f8b1c2d4e5f60718293a4b5c6d7e8f9a0b1c2d3 to integer');
        expect(cleaned).not.toContain('3f8b1c2d4e5f60718293a4b5c6d7e8f9a0b1c2d3');
    });

    it('classifies a PostgreSQL type mismatch without echoing the operand', () => {
        const reason = describeProbeFailure(new Error('operator does not exist: text = uuid'));
        expect(reason).toBe('columns are not comparable (type mismatch)');
    });

    it('classifies a SQL Server conversion failure without echoing the value', () => {
        const reason = describeProbeFailure(
            new Error(`Conversion failed when converting the varchar value 'AA:1000000' to data type int.`),
        );
        expect(reason).toBe('columns are not comparable (type mismatch)');
        expect(reason).not.toContain('AA:1000000');
    });

    it('classifies timeout, permission, missing-object and connectivity failures', () => {
        expect(describeProbeFailure(new Error('canceling statement due to statement timeout')))
            .toBe('probe exceeded its timeout');
        expect(describeProbeFailure(new Error('permission denied for table customer')))
            .toBe('no permission to read one of the columns');
        expect(describeProbeFailure(new Error('relation "acgi.gone" does not exist')))
            .toBe('table or column no longer exists');
        expect(describeProbeFailure(new Error('Connection terminated unexpectedly')))
            .toBe('lost the database connection during the probe');
    });

    it('sanitizes even an unrecognised error before it can be persisted', () => {
        const reason = describeProbeFailure(new Error(`something novel happened to 'jane.doe@example.com'`));
        expect(reason).not.toContain('jane.doe@example.com');
        expect(reason.startsWith('probe failed:')).toBe(true);
    });

    it('extracts a provider error code when one is present', () => {
        const pgErr = Object.assign(new Error('operator does not exist'), { code: '42883' });
        expect(extractSqlState(pgErr)).toBe('42883');
        expect(extractSqlState(new Error('no code'))).toBeUndefined();
        expect(extractSqlState(Object.assign(new Error('x'), { number: 245 }))).toBe('245');
    });
});
