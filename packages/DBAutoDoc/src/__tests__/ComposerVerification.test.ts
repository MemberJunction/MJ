import { describe, it, expect } from 'vitest';
import { compose } from '../discovery/Composer.js';
import { KeyVerifier } from '../discovery/JoinProbe.js';
import { BaseAutoDocDriver, DriverProbeOutcome } from '../drivers/BaseAutoDocDriver.js';
import { OrganicKeyCluster, OrganicKeyClusterMember } from '../types/organic-keys.js';

interface ProbeOnlyDriver {
    probeJoinContainment(
        child: { schema: string; table: string; column: string },
        parent: { schema: string; table: string; column: string },
        sampleSize: number,
        timeoutMs: number,
    ): Promise<DriverProbeOutcome>;
}

/** Route each probe by the child column's fully-qualified name. */
function driverFor(
    byChild: Record<string, DriverProbeOutcome>,
    fallback: DriverProbeOutcome = { ok: true, sampledValues: 100, matchedValues: 100 },
): { driver: BaseAutoDocDriver; probed: string[] } {
    const probed: string[] = [];
    const impl: ProbeOnlyDriver = {
        probeJoinContainment: async (child) => {
            const key = `${child.schema}.${child.table}.${child.column}`;
            probed.push(key);
            return byChild[key] ?? fallback;
        },
    };
    return { driver: impl as unknown as BaseAutoDocDriver, probed };
}

function member(schema: string, table: string, column: string, isPrimaryKey = false): OrganicKeyClusterMember {
    return { schema, table, column, participatesInFK: false, fkTarget: null, isPrimaryKey };
}

function cluster(id: string, concept: string, members: OrganicKeyClusterMember[]): OrganicKeyCluster {
    return {
        id,
        concept,
        normalization: 'ExactMatch',
        members,
        confidence: 0.9,
        reasoning: `${concept} shared across tables`,
        maxIntraDistance: 0.05,
    } as OrganicKeyCluster;
}

const MATCHES_NOTHING: DriverProbeOutcome = { ok: true, sampledValues: 1000, matchedValues: 0 };
const CANNOT_COMPARE: DriverProbeOutcome = { ok: false, reason: 'columns are not comparable (type mismatch)' };

describe('compose — value-overlap gate on emit (MJC-75, MJC-79)', () => {
    it('drops a member whose values do not overlap the anchor', async () => {
        // postal_code clusters with a real key on name/description similarity alone.
        const c = cluster('cluster_0', 'customer_id', [
            member('acgi', 'customer', 'cust_id', true),
            member('acgi', 'address', 'cust_id'),
            member('acgi', 'demographic', 'postal_code'),
        ]);
        const { driver } = driverFor({ 'acgi.demographic.postal_code': MATCHES_NOTHING });
        const r = await compose([c], [], new KeyVerifier(driver));

        expect(r.emitted).toBe(1);
        expect(r.droppedMembers).toBe(1);
        const kept = r.annotatedClusters[0].members.map((m) => m.column);
        expect(kept).toEqual(['cust_id', 'cust_id']);
        expect(kept).not.toContain('postal_code');
    });

    it('drops the whole cluster when nothing survives but the anchor', async () => {
        const c = cluster('cluster_1', 'postal_code', [
            member('acgi', 'address', 'postal_code', true),
            member('acgi', 'demographic', 'postal_code'),
        ]);
        const { driver } = driverFor({ 'acgi.demographic.postal_code': MATCHES_NOTHING });
        const r = await compose([c], [], new KeyVerifier(driver));

        expect(r.emitted).toBe(0);
        expect(r.droppedUnverified).toBe(1);
        expect(r.output).toEqual({});
        expect(r.verification[0].dropped).toBe(true);
    });

    it('drops a cluster that no longer spans two tables after the gate', async () => {
        const c = cluster('cluster_2', 'code', [
            member('s', 't1', 'code', true),
            member('s', 't1', 'code_alt'),
            member('s', 't2', 'code'),
        ]);
        const { driver } = driverFor({ 's.t2.code': MATCHES_NOTHING });
        const r = await compose([c], [], new KeyVerifier(driver));

        // code_alt survives the probe, but everything left is on s.t1 — there is no
        // cross-table organic key to emit.
        expect(r.emitted).toBe(0);
        expect(r.droppedUnverified).toBe(1);
    });

    it('KEEPS an Unprobed member — an unevaluable join is not a refuted one', async () => {
        // The real cross-schema key: elevate text column against a netforum uuid PK. The
        // engine could not compare them. Dropping here would delete the strongest real
        // link in the tenant on the strength of a failure to measure.
        const c = cluster('cluster_3', 'remote_user_id', [
            member('netforum', 'co_customer', 'cst_key', true),
            member('elevate', 'app_user', 'remote_user_id'),
        ]);
        const { driver } = driverFor({ 'elevate.app_user.remote_user_id': CANNOT_COMPARE });
        const r = await compose([c], [], new KeyVerifier(driver));

        expect(r.emitted).toBe(1);
        expect(r.droppedMembers).toBe(0);
        expect(r.verification[0].results[0].status).toBe('Unprobed');
        expect(r.verification[0].results[0].reason).toContain('not comparable');
    });

    it('probes against a PK anchor when the cluster has one, N-1 times not N²', async () => {
        const c = cluster('cluster_4', 'customer_id', [
            member('acgi', 'address', 'cust_id'),
            member('acgi', 'customer', 'record_key', true),
            member('acgi', 'invoice', 'cust_id'),
            member('acgi', 'payment', 'cust_id'),
        ]);
        const { driver, probed } = driverFor({});
        const r = await compose([c], [], new KeyVerifier(driver));

        // 4 members -> 3 probes, all against the PK member.
        expect(probed.length).toBe(3);
        expect(probed).not.toContain('acgi.customer.record_key');
        expect(r.verification[0].anchor).toBe('acgi.customer.record_key');
    });

    it('emits everything unverified when no verifier is supplied, and says so', async () => {
        const c = cluster('cluster_5', 'x', [member('s', 't1', 'x'), member('s', 't2', 'x')]);
        const r = await compose([c], [], null);

        expect(r.emitted).toBe(1);
        expect(r.droppedUnverified).toBe(0);
        expect(r.verification[0].results).toEqual([]);
    });

    it('the probe budget is shared across clusters, not reset per cluster', async () => {
        const clusters = [
            cluster('c0', 'a', [member('s', 't0', 'a', true), member('s', 't1', 'a')]),
            cluster('c1', 'b', [member('s', 't2', 'b', true), member('s', 't3', 'b')]),
            cluster('c2', 'c', [member('s', 't4', 'c', true), member('s', 't5', 'c')]),
        ];
        const { driver, probed } = driverFor({});
        const verifier = new KeyVerifier(driver, { maxProbes: 2 });
        const r = await compose(clusters, [], verifier);

        expect(probed.length).toBe(2);
        expect(verifier.budget.exhausted).toBe(true);
        // The third cluster's member is Unprobed, so it is KEPT, not dropped.
        expect(r.emitted).toBe(3);
        expect(r.verification[2].results[0].status).toBe('Unprobed');
        expect(r.verification[2].results[0].reason).toContain('budget exhausted');
    });
});

describe('compose — AutoCreateRelatedViewOnForm (MJC-79)', () => {
    function firstKey(output: Record<string, unknown>): { AutoCreateRelatedViewOnForm?: boolean } {
        const schema = Object.values(output)[0] as Record<string, unknown>;
        const tables = Object.values(schema)[0] as { OrganicKeys: Array<{ AutoCreateRelatedViewOnForm?: boolean }> };
        return tables.OrganicKeys[0];
    }

    const c = cluster('cluster_6', 'email', [member('s', 't1', 'email'), member('s', 't2', 'email')]);

    it('defaults to FALSE — a machine-proposed key does not silently create grids', async () => {
        const r = await compose([c], [], null);
        expect(firstKey(r.output as Record<string, unknown>).AutoCreateRelatedViewOnForm).toBe(false);
    });

    it('honours an explicit opt-in', async () => {
        const r = await compose([c], [], null, { autoCreateRelatedViewOnForm: true });
        expect(firstKey(r.output as Record<string, unknown>).AutoCreateRelatedViewOnForm).toBe(true);
    });
});
