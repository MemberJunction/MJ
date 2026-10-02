import { describe, it, expect } from 'vitest';
import {
    KeyVerifier,
    KeyCandidate,
    CandidateKey,
    StampFor,
    DEFAULT_KEY_VERIFICATION,
} from '../discovery/JoinProbe.js';
import { BaseAutoDocDriver, DriverProbeOutcome } from '../drivers/BaseAutoDocDriver.js';
import { DescribeProbeFailure, SanitizeErrorText, ExtractSqlState } from '../drivers/probeErrors.js';

/**
 * A driver that only implements the probe. Everything else on BaseAutoDocDriver is
 * irrelevant here, so the fake is cast through a declared shape rather than stubbing
 * forty abstract methods — no `any`, and the probe contract stays fully typed.
 */
interface ProbeOnlyDriver {
    ProbeJoinContainment(
        child: { Schema: string; Table: string; Column: string },
        parent: { Schema: string; Table: string; Column: string },
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
        ProbeJoinContainment: async (child, parent, sampleSize, timeoutMs) => {
            const call: ProbeCall = {
                child: `${child.Schema}.${child.Table}.${child.Column}`,
                parent: `${parent.Schema}.${parent.Table}.${parent.Column}`,
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
        return { Schema: schema, Table: table, Column: column };
    };
    return { Child: split(child), Parent: split(parent) };
}

describe('KeyVerifier — the three outcomes are distinct', () => {
    it('Verified when containment clears the floor, and reports the counts', async () => {
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 1000, MatchedValues: 988 }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('elevate.app_user.remote_user_id', 'netforum.co_customer.cst_key'));

        expect(r.Status).toBe('Verified');
        expect(r.Containment).not.toBeNull();
        expect(r.Containment?.SampledValues).toBe(1000);
        expect(r.Containment?.MatchedValues).toBe(988);
        expect(r.Containment?.Containment).toBeCloseTo(0.988, 5);
        expect(r.Reason).toContain('988 of 1000');
    });

    it('Refuted when the probe RAN and measured zero — the MJC-128 shape', async () => {
        // acgi.address.cust_id holds a bare id; acgi.customer.record_key is namespaced
        // 'AA:<id>'. The join is generated, returns nothing, and raises no error.
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 1000, MatchedValues: 0 }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('acgi.address.cust_id', 'acgi.customer.record_key'));

        expect(r.Status).toBe('Refuted');
        expect(r.Containment?.MatchedValues).toBe(0);
        expect(r.Containment?.SampledValues).toBe(1000);
        expect(r.Reason).toContain('below');
    });

    it('Unprobed — NOT Refuted — when the driver could not evaluate the join', async () => {
        // This is the distinction the whole module exists for. `testValueOverlap`
        // returns a bare number and reports this case as 0, which a containment gate
        // then reads as a refutation, silently deleting a candidate that may be correct.
        const { driver } = fakeDriver(() => ({
            Ok: false,
            Reason: 'columns are not comparable (type mismatch)',
            Code: '42883',
        }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('elevate.membership.customer_key', 'netforum.membership_ref.customer_key'));

        expect(r.Status).toBe('Unprobed');
        expect(r.Status).not.toBe('Refuted');
        expect(r.Containment).toBeNull();
        expect(r.Reason).toContain('not comparable');
    });

    it('Unprobed when the child column has nothing to sample', async () => {
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 0, MatchedValues: 0 }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('a.t.c', 'b.u.d'));

        expect(r.Status).toBe('Unprobed');
        expect(r.Containment).toBeNull();
    });

    it('a sparse-but-real soft key is Verified, not Refuted', async () => {
        // 6% containment: a connector schema full of orphans. The floor exists to catch
        // 0%, not to adjudicate FK quality — that is FKDetector's 75% GATE 6.
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 1000, MatchedValues: 60 }));
        const v = new KeyVerifier(driver);
        expect((await v.Verify(edge('a.t.c', 'b.u.d'))).Status).toBe('Verified');
    });
});

describe('KeyVerifier — the bound', () => {
    it('stops probing at maxProbes and reports every later candidate Unprobed', async () => {
        const { driver, calls } = fakeDriver(() => ({ Ok: true, SampledValues: 10, MatchedValues: 10 }));
        const v = new KeyVerifier(driver, { maxProbes: 3 });

        const results = await v.VerifyAll([
            edge('s.t1.c', 's.p.k'),
            edge('s.t2.c', 's.p.k'),
            edge('s.t3.c', 's.p.k'),
            edge('s.t4.c', 's.p.k'),
            edge('s.t5.c', 's.p.k'),
        ]);

        // Exactly three queries reached the database — the cap is a real cap.
        expect(calls.length).toBe(3);
        expect(results.get(CandidateKey(edge('s.t3.c', 's.p.k')))?.Status).toBe('Verified');
        expect(results.get(CandidateKey(edge('s.t4.c', 's.p.k')))?.Status).toBe('Unprobed');
        expect(results.get(CandidateKey(edge('s.t5.c', 's.p.k')))?.Reason).toContain('budget exhausted');
        expect(v.Budget.Exhausted).toBe(true);
        expect(v.Budget.ProbesUsed).toBe(3);
    });

    it('passes the configured sampleSize and timeout through to the driver', async () => {
        const { driver, calls } = fakeDriver(() => ({ Ok: true, SampledValues: 5, MatchedValues: 5 }));
        const v = new KeyVerifier(driver, { sampleSize: 250, probeTimeoutMs: 1234 });
        await v.Verify(edge('s.t.c', 's.p.k'));

        expect(calls[0].sampleSize).toBe(250);
        expect(calls[0].timeoutMs).toBe(1234);
    });

    it('caches by edge so the same candidate costs one probe, not N', async () => {
        const { driver, calls } = fakeDriver(() => ({ Ok: true, SampledValues: 10, MatchedValues: 9 }));
        const v = new KeyVerifier(driver);
        await v.Verify(edge('s.t.c', 's.p.k'));
        await v.Verify(edge('s.t.c', 's.p.k'));
        await v.Verify(edge('S.T.C', 'S.P.K')); // case-insensitive same edge

        expect(calls.length).toBe(1);
        expect(v.Budget.ProbesUsed).toBe(1);
    });

    it('probes nothing when disabled, and calls the result Unprobed rather than Verified', async () => {
        const { driver, calls } = fakeDriver(() => ({ Ok: true, SampledValues: 10, MatchedValues: 10 }));
        const v = new KeyVerifier(driver, { enabled: false });
        const r = await v.Verify(edge('s.t.c', 's.p.k'));

        expect(calls.length).toBe(0);
        expect(r.Status).toBe('Unprobed');
        expect(r.Status).not.toBe('Verified');
    });

    it('is Unprobed, never Verified, with no driver at all', async () => {
        const v = new KeyVerifier(null);
        const r = await v.Verify(edge('s.t.c', 's.p.k'));
        expect(r.Status).toBe('Unprobed');
        expect(r.Reason).toContain('no database driver');
    });

    it('does not probe a column against itself', async () => {
        const { driver, calls } = fakeDriver(() => ({ Ok: true, SampledValues: 10, MatchedValues: 10 }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('s.t.c', 's.t.c'));
        expect(calls.length).toBe(0);
        expect(r.Status).toBe('Unprobed');
    });

    it('the documented defaults are the actual defaults', async () => {
        const { driver, calls } = fakeDriver(() => ({ Ok: true, SampledValues: 1, MatchedValues: 1 }));
        const v = new KeyVerifier(driver);
        await v.Verify(edge('s.t.c', 's.p.k'));

        expect(DEFAULT_KEY_VERIFICATION.sampleSize).toBe(1000);
        expect(DEFAULT_KEY_VERIFICATION.maxProbes).toBe(500);
        expect(DEFAULT_KEY_VERIFICATION.probeTimeoutMs).toBe(5000);
        expect(DEFAULT_KEY_VERIFICATION.minContainment).toBe(0.05);
        expect(calls[0].sampleSize).toBe(DEFAULT_KEY_VERIFICATION.sampleSize);
        expect(v.ResolvedConfig.maxProbes).toBe(DEFAULT_KEY_VERIFICATION.maxProbes);
    });

    it('an explicit partial config keeps the defaults for every other field', async () => {
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 1, MatchedValues: 1 }));
        const v = new KeyVerifier(driver, { maxProbes: 7 });
        expect(v.ResolvedConfig.maxProbes).toBe(7);
        expect(v.ResolvedConfig.sampleSize).toBe(DEFAULT_KEY_VERIFICATION.sampleSize);
        expect(v.ResolvedConfig.enabled).toBe(true);
    });
});

describe('the probe cannot carry a data value', () => {
    it('a Verified result exposes counts and nothing value-shaped', async () => {
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 5000, MatchedValues: 4812 }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('s.t.c', 's.p.k'));

        // "4,812 of 5,000 matched" is the maximum resolution. Assert structurally: the
        // containment object has exactly the three numeric count fields and no other.
        expect(Object.keys(r.Containment ?? {}).sort()).toEqual(
            ['Containment', 'MatchedValues', 'SampledValues'],
        );
        for (const val of Object.values(r.Containment ?? {})) {
            expect(typeof val).toBe('number');
        }
        // The stamp that gets persisted is counts + prose only.
        const stamp = StampFor('LLM', r);
        expect(typeof stamp.MatchedRows).toBe('number');
        expect(typeof stamp.SampledRows).toBe('number');
        expect(Object.keys(stamp).sort()).toEqual(
            ['MatchedRows', 'Provenance', 'SampledRows', 'VerificationNote', 'VerifiedAt', 'Verification'].sort(),
        );
    });

    it('an Unprobed stamp records null counts, never a fabricated zero', async () => {
        const v = new KeyVerifier(null);
        const stamp = StampFor('Organic', await v.Verify(edge('s.t.c', 's.p.k')));
        expect(stamp.Verification).toBe('Unprobed');
        expect(stamp.MatchedRows).toBeNull();
        expect(stamp.SampledRows).toBeNull();
    });

    it('StampFor carries the provenance it was given', async () => {
        const { driver } = fakeDriver(() => ({ Ok: true, SampledValues: 10, MatchedValues: 10 }));
        const v = new KeyVerifier(driver);
        const r = await v.Verify(edge('s.t.c', 's.p.k'));
        expect(StampFor('Declared', r).Provenance).toBe('Declared');
        expect(StampFor('LLM', r).Provenance).toBe('LLM');
    });
});

describe('probe failure reasons never leak a value', () => {
    it('strips single-quoted, double-quoted, backticked and bracketed runs', () => {
        const cleaned = SanitizeErrorText(
            `invalid input syntax for type uuid: "AA:1000000" near 'secret@example.com' in [SSN] and \`4111111111111111\``,
        );
        expect(cleaned).not.toContain('AA:1000000');
        expect(cleaned).not.toContain('secret@example.com');
        expect(cleaned).not.toContain('SSN');
        expect(cleaned).not.toContain('4111111111111111');
    });

    it('strips long unquoted tokens, which are values far more often than words', () => {
        const cleaned = SanitizeErrorText('could not convert 3f8b1c2d4e5f60718293a4b5c6d7e8f9a0b1c2d3 to integer');
        expect(cleaned).not.toContain('3f8b1c2d4e5f60718293a4b5c6d7e8f9a0b1c2d3');
    });

    it('classifies a PostgreSQL type mismatch without echoing the operand', () => {
        const reason = DescribeProbeFailure(new Error('operator does not exist: text = uuid'));
        expect(reason).toBe('columns are not comparable (type mismatch)');
    });

    it('classifies a SQL Server conversion failure without echoing the value', () => {
        const reason = DescribeProbeFailure(
            new Error(`Conversion failed when converting the varchar value 'AA:1000000' to data type int.`),
        );
        expect(reason).toBe('columns are not comparable (type mismatch)');
        expect(reason).not.toContain('AA:1000000');
    });

    it('classifies timeout, permission, missing-object and connectivity failures', () => {
        expect(DescribeProbeFailure(new Error('canceling statement due to statement timeout')))
            .toBe('probe exceeded its timeout');
        expect(DescribeProbeFailure(new Error('permission denied for table customer')))
            .toBe('no permission to read one of the columns');
        expect(DescribeProbeFailure(new Error('relation "acgi.gone" does not exist')))
            .toBe('table or column no longer exists');
        expect(DescribeProbeFailure(new Error('Connection terminated unexpectedly')))
            .toBe('lost the database connection during the probe');
    });

    it('sanitizes even an unrecognised error before it can be persisted', () => {
        const reason = DescribeProbeFailure(new Error(`something novel happened to 'jane.doe@example.com'`));
        expect(reason).not.toContain('jane.doe@example.com');
        expect(reason.startsWith('probe failed:')).toBe(true);
    });

    it('extracts a provider error code when one is present', () => {
        const pgErr = Object.assign(new Error('operator does not exist'), { code: '42883' });
        expect(ExtractSqlState(pgErr)).toBe('42883');
        expect(ExtractSqlState(new Error('no code'))).toBeUndefined();
        expect(ExtractSqlState(Object.assign(new Error('x'), { number: 245 }))).toBe('245');
    });
});
